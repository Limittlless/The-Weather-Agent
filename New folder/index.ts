import "dotenv/config";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ChatGroq } from "@langchain/groq";
import {
  HumanMessage,
  AIMessage,
  ToolMessage,
  BaseMessage,
} from "@langchain/core/messages";

// ============================================================
// تحقق من وجود مفتاح الـ API قبل أي شي
// ============================================================
if (!process.env.GROQ_API_KEY) {
  console.error("خطأ: GROQ_API_KEY غير موجود في ملف .env");
  process.exit(1);
}

// ============================================================
// الخطوة 1: تعريف أداة fetchWeather (mock - بيانات وهمية)
// ============================================================
// tool() بتاخد دالة تنفيذية + معلومات وصفية (اسم، وصف، schema)
// الـ schema هون هو اللي بيشوفه الموديل، مش الدالة نفسها
const fetchWeather = tool(
  async ({ city }: { city: string }) => {
    // بيانات وهمية (mock) بدل استدعاء API حقيقي، حسب طلب المهمة
    const mockData: Record<string, { temperature: number; condition: string }> = {
      Cairo: { temperature: 25, condition: "Sunny" },
      Alexandria: { temperature: 19, condition: "Light Rain" },
      Riyadh: { temperature: 42, condition: "Hot" },
      Tokyo: { temperature: 21, condition: "Clear" },
    };

    const data = mockData[city] ?? { temperature: 28, condition: "Clear" };

    // الأداة لازم ترجع نص (string) دائمًا - هاد شرط LangChain
    return JSON.stringify({
      city,
      temperature: data.temperature,
      condition: data.condition,
    });
  },
  {
    name: "fetchWeather",
    description: "يجلب بيانات الطقس الحالية لمدينة معينة. استدعها دائمًا قبل الإجابة عن أي سؤال متعلق بالطقس.",
    schema: z.object({
      city: z.string().describe("اسم المدينة بالإنجليزي، مثل Cairo أو Tokyo"),
    }),
  }
);

// ============================================================
// الخطوة 2: تعريف Schema الاستخراج (Structured Extraction)
// ============================================================
const WeatherReportExtraction = z.object({
  reports: z.array(
    z.object({
      cityName: z.string().describe("اسم المدينة"),
      temp: z.number().describe("درجة الحرارة كرقم فقط"),
      conditions: z.string().describe("وصف حالة الطقس"),
    })
  ),
});

// z.infer بتولّد لنا TypeScript type تلقائيًا من الـ Zod schema
// بدل ما نكتب interface يدوي - هاد اللي طلبته المهمة بـ "Type Fidelity"
type WeatherReportExtractionType = z.infer<typeof WeatherReportExtraction>;

// ============================================================
// إعداد الموديل الأساسي (بدون أدوات مربوطة بعد)
// ============================================================
const baseModel = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  apiKey: process.env.GROQ_API_KEY,
  temperature: 0,
});

// ============================================================
// دالة مساعدة صغيرة للفصل البصري بين السيناريوهات
// ============================================================
function printHeader(title: string) {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
}

// ============================================================
// السيناريو A: Tool Calling يدوي بالكامل (بدون graph)
// ============================================================
async function scenarioA() {
  printHeader("Scenario A — Manual Tool Calling");

  const userInput = "Should I pack a heavy jacket for my trip to Cairo today?";
  console.log(`User: ${userInput}\n`);

  // نربط الأداة بالموديل. هاد بيخلي الموديل "يعرف" إنه فيه أداة اسمها
  // fetchWeather وشو الـ parameters المطلوبة - لكنه ما بينفذها بنفسه
  const modelWithTools = baseModel.bindTools([fetchWeather]);

  // نبني تاريخ المحادثة كـ array - هاد اللي رح نبنيه يدويًا بدل الـ graph
  const history: BaseMessage[] = [new HumanMessage(userInput)];

  // الاستدعاء الأول: نسأل الموديل، وهو رح يقرر يستخدم الأداة أو لأ
  const aiResponse = await modelWithTools.invoke(history);
  history.push(aiResponse);

  // نفحص إذا الموديل طلب تنفيذ أداة
  if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
    // ممكن يطلب أكثر من أداة بنفس الوقت، فنلف عليهم كلهم
    for (const call of aiResponse.tool_calls) {
      console.log(`[System] Caught LLM request to run tool ${call.name}.`);

      // ننفذ الأداة الحقيقية يدويًا بالـ arguments اللي رجعها الموديل
      // call.args هون مطابق تمامًا للـ schema اللي عرفناه فوق
      const result = await fetchWeather.invoke(call.args as { city: string });

      // نبني ToolMessage ونحطه بتاريخ المحادثة
      // الأهم: tool_call_id لازم يطابق call.id تمامًا وإلا الموديل بيضيع
      const toolMessage = new ToolMessage({
        content: result,
        tool_call_id: call.id!,
      });
      history.push(toolMessage);
    }

    // الآن نرسل المحادثة الكاملة (Human -> AI مع tool_calls -> Tool)
    // للموديل الأساسي (بدون bindTools هالمرة - خلص احتجناها) عشان يعطينا
    // إجابة نهائية مبنية على نتيجة الأداة، وهاد الجزء لازم يكون streaming
    console.log("\nAgent: ");
    const stream = await baseModel.stream(history);
    for await (const chunk of stream) {
      process.stdout.write(String(chunk.content));
    }
    console.log("\n");
  } else {
    // لو ما طلب أداة، نطبع جوابه مباشرة (حالة نادرة بهالسيناريو)
    console.log(`Agent: ${aiResponse.content}\n`);
  }
}

// ============================================================
// السيناريو B: استخراج بيانات منظمة (Structured Output)
// ============================================================
async function scenarioB() {
  printHeader("Scenario B — Structured Data Extraction");

  const userInput =
    "Log the following stats into the database: Riyadh is hot at 42C, Tokyo is clear at 21C.";
  console.log(`User: ${userInput}\n`);

  // withStructuredOutput بتجبر الموديل يرجع JSON مطابق للـ schema تمامًا
  // بدل نص عادي بنحتاج نعمله parse يدوي
  const structuredModel = baseModel.withStructuredOutput(WeatherReportExtraction);

  const result: WeatherReportExtractionType = await structuredModel.invoke(userInput);

  console.log("Extracted object:");
  console.log(JSON.stringify(result, null, 2));
  console.log();
}

// ============================================================
// السيناريو C: Streaming محادثة عادية (بدون أدوات، بدون schema)
// ============================================================
async function scenarioC() {
  printHeader("Scenario C — Direct Conversational Streaming");

  const userInput =
    "Why does the humidity feel different near coastal cities compared to inland deserts?";
  console.log(`User: ${userInput}\n`);

  console.log("Agent: ");
  // stream() بترجع async iterable من القطع (chunks) بدل جواب واحد كامل
  const stream = await baseModel.stream([new HumanMessage(userInput)]);
  for await (const chunk of stream) {
    process.stdout.write(String(chunk.content));
  }
  console.log("\n");
}

// ============================================================
// نقطة التشغيل: ننفذ السيناريوهات الثلاثة بالتسلسل
// ============================================================
async function main() {
  await scenarioA();
  await scenarioB();
  await scenarioC();
}

main().catch((err) => {
  console.error("حدث خطأ:", err);
  process.exit(1);
});

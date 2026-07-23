import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API routes FIRST
  app.post("/api/generate-scenario", async (req, res) => {
    try {
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not defined in the environment secrets.");
      }

      const { buildingInfo } = req.body;
      
      const prompt = `주어진 건물 구조 데이터를 기반으로 맞춤형 자연재해 시나리오를 한국어로 생성하고, 시뮬레이션 타임라인에 부합하는 분석 리포트를 작성하세요.
      건물의 주요 골조 자재, 벽면 자재 구성, 그리고 설치된 안전 설비를 보고, 가장 취약한 재해 또는 시각적으로 가장 드라마틱하게 파괴될 수 있는 재해를 선정하세요. (예: 목조 골조와 유리창이 많다면 '태풍/토네이도'나 '지진', 배수 시설이 아예 없다면 '홍수/침수', 기둥이 약하고 무겁다면 '쓰나미' 등)

      건물 구조 정보:
      - 뼈대 (기둥 및 보): ${JSON.stringify(buildingInfo.frames || [])}
      - 외벽 패널: ${JSON.stringify(buildingInfo.walls || [])}
      - 안전 및 보강 설비: ${JSON.stringify(buildingInfo.utilities || [])}

      JSON 형식의 응답을 반환해 주세요. 응답 스키마는 다음과 같습니다:
      - hazardType: 'earthquake' | 'tornado' | 'tsunami' | 'flood' (이 중 하나 선택)
      - title: 이 재난 시나리오의 제목 (예: "목조 펜트하우스를 덮친 진도 7.5 강진", "배수 불량 스카이스크래퍼의 대홍수 참사" 등)
      - description: 자연재해가 발생하여 건물이 어떻게 흔들리고, 유리가 깨지고 외벽이 파열되는지에 대한 극적인 묘사 (300자 이상 한국어)
      - structuralWeaknesses: 이 건물의 구조적 또는 자재적 약점 요인 목록 (배치된 자재와 설비의 특성을 한국어로 언급해 주세요, 최소 2-3개)
      - timeline: 시뮬레이션의 진행(0~100 범위)에 부합하는 4개의 시나리오 이정표/마일스톤 배열:
        - timeOffset: 시뮬레이션 타임라인상의 상대적 퍼센트 (예: 15, 45, 75, 95)
        - stageName: 해당 단계의 명칭 (예: "미동 및 예진", "창문 균열 및 돌풍", "최대 충격 및 외벽 파손", "구조물 붕괴 및 후유증")
        - description: 이 단계에서 건물에 생기는 구체적인 물리적 변화 묘사 (유리창 shatter, 콘크리트 크랙, 소방 경보, 정전 등)
        - suggestedIntensity: 이 단계에서 가해지는 추천 시뮬레이션 강도 (Level 1~10)
        - dynamicEffects: 연동될 가상 효과 플래그 객체 (glassShatter: 유리 파손 여부, wallBreak: 외벽 분해 발생 여부, lightsOut: 정전/소등 여부, fireAlarm: 소방 알람 작동 여부)
      - escapeAnalysis: 이 건물 내에 사람이 있었을 때의 탈출 확률 분석 및 구체적 생존 행동 요령 (한국어)
      - improvementTips: 건물을 실질적으로 더 튼튼하게 보강하기 위한 조치 제안 목록 (예: "목재 기둥 대신 철골 구조 적용", "배수 밸브 보강", "강화 유리 교체" 등, 최소 3개)`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hazardType: { type: Type.STRING, description: "선택지: 'earthquake', 'tornado', 'tsunami', 'flood'" },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              structuralWeaknesses: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              timeline: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    timeOffset: { type: Type.INTEGER },
                    stageName: { type: Type.STRING },
                    description: { type: Type.STRING },
                    suggestedIntensity: { type: Type.INTEGER },
                    dynamicEffects: {
                      type: Type.OBJECT,
                      properties: {
                        glassShatter: { type: Type.BOOLEAN },
                        wallBreak: { type: Type.BOOLEAN },
                        lightsOut: { type: Type.BOOLEAN },
                        fireAlarm: { type: Type.BOOLEAN }
                      },
                      required: ["glassShatter", "wallBreak", "lightsOut", "fireAlarm"]
                    }
                  },
                  required: ["timeOffset", "stageName", "description", "suggestedIntensity", "dynamicEffects"]
                }
              },
              escapeAnalysis: { type: Type.STRING },
              improvementTips: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["hazardType", "title", "description", "structuralWeaknesses", "timeline", "escapeAnalysis", "improvementTips"]
          }
        }
      });

      const text = response.text;
      res.json(JSON.parse(text || "{}"));
    } catch (err: any) {
      console.error("Gemini Scenario Generation Error:", err);
      res.status(500).json({ error: err.message || "시나리오 생성 중 오류가 발생했습니다." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface SkinAnalysisResult {
  skinType: string;
  overallScore: number;
  skinAge: number;
  radarData: { name: string; value: number }[];
  problems: string[];
  riskLevels: {
    sensitivity: string;
    acne: string;
    uvDamage: string;
    aging: string;
  };
  detailedDimensions: {
    name: string;
    value: number;
    description: string;
  }[];
  changeAnalysis?: {
    metric: string;
    previousValue: number;
    currentValue: number;
    reason: string;
    conclusion: string;
  }[];
  suggestions: string[];
  routine: {
    morning: string[];
    evening: string[];
  };
  weeklyPlan: {
    title: string;
    phases: {
      days: string;
      focus: string;
      steps: string[];
    }[];
  };
}

export async function analyzeSkin(imageData: string, previousResult?: SkinAnalysisResult): Promise<SkinAnalysisResult> {
  let contextPrompt = "";
  if (previousResult) {
    contextPrompt = `\n[历史记录]：${JSON.stringify({
      overallScore: previousResult.overallScore,
      radarData: previousResult.radarData,
      skinAge: previousResult.skinAge
    })}. 
要求：
1. 除非照片显示极其明显的剧变，否则核心指标(分值、肤质)应保持高度临床稳定性，波动应控制在5%以内。
2. 若有微调，在 'changeAnalysis' 中用皮肤学逻辑合理解释。`;
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: [
      {
        parts: [
          {
            text: `你是一位严谨的皮肤科专家，请分析照片并直接输出JSON。要求：
1. 评分(0-100)必须保持极高的前后一致性和客观性。
2. skinAge: 肌龄。
3. radarData: 油、水、敏、屏障、弹性 (0-100)。
4. riskLevels: 高/中/安全。
5. detailedDimensions: 毛孔、黑眼圈、色斑、皱纹。
${contextPrompt}
6. 全中文JSON。`,
          },
          {
            inlineData: {
              data: imageData.split(",")[1], 
              mimeType: "image/jpeg",
            },
          },
        ],
      },
    ],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["skinType", "overallScore", "skinAge", "radarData", "problems", "riskLevels", "detailedDimensions", "suggestions", "routine", "weeklyPlan"],
        properties: {
          skinType: { type: Type.STRING },
          overallScore: { type: Type.NUMBER },
          skinAge: { type: Type.NUMBER },
          radarData: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.NUMBER },
              },
            },
          },
          problems: { type: Type.ARRAY, items: { type: Type.STRING } },
          riskLevels: {
            type: Type.OBJECT,
            properties: {
              sensitivity: { type: Type.STRING },
              acne: { type: Type.STRING },
              uvDamage: { type: Type.STRING },
              aging: { type: Type.STRING },
            },
          },
          detailedDimensions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.NUMBER },
                description: { type: Type.STRING },
              },
            },
          },
          changeAnalysis: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                metric: { type: Type.STRING },
                previousValue: { type: Type.NUMBER },
                currentValue: { type: Type.NUMBER },
                reason: { type: Type.STRING },
                conclusion: { type: Type.STRING },
              },
            },
          },
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          routine: {
            type: Type.OBJECT,
            properties: {
              morning: { type: Type.ARRAY, items: { type: Type.STRING } },
              evening: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
          weeklyPlan: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              phases: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    days: { type: Type.STRING },
                    focus: { type: Type.STRING },
                    steps: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return JSON.parse(response.text);
}

export async function consultAI(message: string, history: { role: string; content: string }[]) {
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction: "你是一位名为 SkinGPT 的专业 AI 皮肤科医生。请用中文回答关于皮肤健康的问题。对于每个回答，请使用以下结构：\n### 诊断：[可能的原因]\n### 缘由：[为什么会发生]\n### 建议：[该怎么做]\n保持结构化、医疗专业且通俗易懂。",
    },
  });

  // History mapping if needed, but SDK usually handles it if we pass it
  // For simplicity here, just send the latest with context if requested
  const response = await chat.sendMessage({
    message: message,
  });

  return response.text;
}

export async function analyzeIngredients(ingredients: string, imageData?: string) {
  const contents: any[] = [];
  
  if (imageData) {
    contents.push({
      parts: [
        { text: "请分析这张化妆品配料表照片中的成分，并为皮肤健康应用提供报告。如果照片中有文字，请先提取文字，然后分析成分。必须使用中文返回 JSON 格式。" },
        { inlineData: { data: imageData.split(",")[1], mimeType: "image/jpeg" } }
      ]
    });
  } else {
    contents.push({
      parts: [
        { text: `请分析这些护肤品成分并为皮肤健康应用提供报告："${ingredients}"。必须使用中文返回 JSON 格式。` }
      ]
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["riskIngredients", "safeIngredients", "suitableSkinTypes"],
        properties: {
          riskIngredients: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
            },
          },
          safeIngredients: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                benefit: { type: Type.STRING },
              },
            },
          },
          suitableSkinTypes: { type: Type.STRING },
          safetyRating: { type: Type.NUMBER, description: "0-10 safety score" },
        },
      },
    },
  });

  return JSON.parse(response.text);
}

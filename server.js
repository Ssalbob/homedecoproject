const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.UPSTAGE_API_KEY;
const MODEL = process.env.UPSTAGE_MODEL || "solar-pro3-260323";
const API_URL = "https://api.upstage.ai/v1/chat/completions";

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(data));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("요청 내용이 너무 큽니다."));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function buildPrompt(data) {
  return `
너는 고등학생의 첫 웹사이트 프로젝트에 들어갈 결과 분석 문장을 작성하는 도우미야.
전문가처럼 너무 어렵게 쓰지 말고, 고등학생도 이해할 수 있는 쉬운 한국어로 작성해.

아래 조건을 분석해서 웹페이지 결과 화면에 바로 보여줄 문장을 만들어줘.

- 사용자 이름: ${data.userName}
- 방 크기: 가로 ${data.roomWidth}m, 세로 ${data.roomHeight}m, 전체 ${data.roomArea}㎡
- 예산: ${data.budget}원
- 추천 가구 예상 비용: ${data.totalPrice}원
- 사용 목적: ${data.purposeLabel}
- 선호 분위기: ${data.moodLabel}
- 추천 가구: ${data.furnitureNames.join(", ")}
- 공간 활용도: ${data.space.score}
- 공간 활용도 설명: ${data.space.text}
- 추가 추천: ${data.extraSuggestions.join(" / ")}
- 기타 요구사항: ${data.extraRequirements || "없음"}

작성 조건:
1. 4~5문장으로 작성해.
2. 첫 문장은 전체 평가로 시작해.
3. 방 배치, 예산, 분위기, 개선점을 모두 포함해.
4. HTML 태그나 마크다운 기호는 쓰지 마.
5. 말투는 친절하고 자연스럽게 써.
`;
}

async function analyzeRoom(request, response) {
  if (!API_KEY) {
    sendJson(response, 500, {
      error: "UPSTAGE_API_KEY 환경변수가 설정되지 않았습니다."
    });
    return;
  }

  try {
    const body = await readRequestBody(request);
    const data = JSON.parse(body);

    const apiResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "너는 인테리어와 공간 활용을 쉽게 설명하는 한국어 웹페이지 분석 도우미야."
          },
          {
            role: "user",
            content: buildPrompt(data)
          }
        ],
        temperature: 0.7,
        max_tokens: 450
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      sendJson(response, apiResponse.status, {
        error: "AI API 요청에 실패했습니다.",
        detail: errorText
      });
      return;
    }

    const result = await apiResponse.json();
    const analysis = result.choices?.[0]?.message?.content?.trim();

    if (!analysis) {
      sendJson(response, 500, {
        error: "AI 분석 결과를 찾을 수 없습니다."
      });
      return;
    }

    sendJson(response, 200, { analysis });
  } catch (error) {
    sendJson(response, 500, {
      error: "결과 분석 중 오류가 발생했습니다.",
      detail: error.message
    });
  }
}

function serveIndex(response) {
  const filePath = path.join(__dirname, "index.html");

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(500, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      response.end("index.html 파일을 읽을 수 없습니다.");
      return;
    }

    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/api/analyze") {
    analyzeRoom(request, response);
    return;
  }

  if (request.method === "GET" && (request.url === "/" || request.url === "/index.html")) {
    serveIndex(response);
    return;
  }

  response.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end("페이지를 찾을 수 없습니다.");
});

server.listen(PORT, () => {
  console.log(`RoomFit server is running at http://localhost:${PORT}`);
});

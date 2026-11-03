// Vercel 서버리스 함수 핸들러 (Node.js 환경)
module.exports = async function handler(req, res) {
    // GET 요청만 허용하도록 검사 (그 외 요청은 405 Method Not Allowed)
    if (req.method !== 'GET') {
        // 허용되지 않은 메서드 응답 반환
        return res.status(405).json({ error: 'GET 요청만 지원합니다.' });
    }

    // URL 쿼리 파라미터에서 시/도 이름(sido) 추출 (없으면 기본값 '서울')
    const { sido = '서울' } = req.query;

    // Vercel 환경변수에서 에어코리아 인증키(Decoding 키) 가져오기
    const serviceKey = process.env.AIRKOREA_KEY;

    // 환경변수에 인증키가 설정되지 않은 경우 에러 응답
    if (!serviceKey) {
        // 서버 환경 설정 오류 안내 반환
        return res.status(500).json({
            error: '서버 환경변수(AIRKOREA_KEY)가 설정되지 않았습니다. .env.local 또는 Vercel 환경변수를 확인해주세요.'
        });
    }

    // 에어코리아 오픈API 기본 요청 주소
    const API_BASE_URL = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty';

    // Decoding 키를 encodeURIComponent로 감싸서 URL 쿼리 스트링 구성
    const queryParams = [
        `serviceKey=${encodeURIComponent(serviceKey.trim())}`, // 인증키 인코딩 적용
        'returnType=json',                                     // 응답 데이터 형식 (JSON)
        'numOfRows=100',                                       // 가져올 측정소 개수
        'pageNo=1',                                            // 페이지 번호
        `sidoName=${encodeURIComponent(sido)}`,                 // 조회할 시/도 이름 인코딩 적용
        'ver=1.3'                                              // API 버전
    ].join('&');

    // 최종 요청 URL 조합
    const targetUrl = `${API_BASE_URL}?${queryParams}`;

    try {
        // 공공데이터포털 API 서버로 데이터 요청
        const apiResponse = await fetch(targetUrl);

        // 응답 본문을 우선 텍스트 형태로 수신
        const rawText = await apiResponse.text();

        // 수신된 텍스트를 JSON으로 파싱 시도
        let data;
        try {
            // JSON 문자열 파싱
            data = JSON.parse(rawText);
        } catch (parseError) {
            // 파싱 실패 시: 공공데이터포털에서 인증키 오류 등으로 XML 에러를 반환한 경우
            return res.status(400).json({
                error: '인증키 또는 요청값을 확인해주세요.',
                rawResponse: rawText
            });
        }

        // 응답 본문 안의 resultCode 성공 여부 확인 ('00'이 정상 코드)
        const resultCode = data?.response?.header?.resultCode;
        // 응답 메시지 추출
        const resultMsg = data?.response?.header?.resultMsg;

        // resultCode가 존재하고 '00'이 아닌 경우 에러 처리
        if (resultCode && resultCode !== '00') {
            // 공공데이터 API 내부 에러 메시지 반환
            return res.status(400).json({
                error: `공공데이터 API 오류 (결과 코드: ${resultCode}) - ${resultMsg || '요청 처리에 실패했습니다.'}`,
                raw: data
            });
        }

        // 정상 데이터인 경우 클라이언트에 200 성공 및 JSON 데이터 전달
        return res.status(200).json(data);

    } catch (error) {
        // 네트워크 연결 및 기타 서버 예외 처리
        console.error('에어코리아 API 요청 실패:', error);
        // 클라이언트에 500 에러 응답 반환
        return res.status(500).json({
            error: `서버 내부 오류가 발생했습니다: ${error.message}`
        });
    }
}

// CommonJS 및 Vercel ESM 환경 호환성 보장
module.exports = handler;
module.exports.default = handler;



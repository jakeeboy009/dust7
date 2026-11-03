// 프론트엔드에서 호출할 내부 Vercel 서버리스 함수 엔드포인트 주소
const INTERNAL_API_URL = '/api/dust';

// Chart.js 인스턴스를 저장할 전역 변수 (중복 렌더링 방지 및 갱신용)
let topDustChartInstance = null;

// HTML 문서 내 주요 DOM 요소들을 변수에 저장
// 시/도 선택 드롭다운 요소
const sidoSelect = document.getElementById('sidoSelect');
// 선택된 지역 안내 제목 요소
const selectedAreaText = document.getElementById('selectedAreaText');
// 공기 신호등 메인 카드 컨테이너
const trafficCard = document.getElementById('trafficCard');
// 신호등 커다란 이모지 (🔵🟢🟠🔴) 요소
const trafficEmoji = document.getElementById('trafficEmoji');
// 대표 상태(좋음/보통/나쁨/매우나쁨) 텍스트 요소
const trafficStatusText = document.getElementById('trafficStatusText');
// 평균 미세먼지 수치를 표시할 큰 숫자 요소
const averagePm10Value = document.getElementById('averagePm10Value');
// 생활 권고 한 줄 안내 문구 (마스크 착용 등)
const trafficAdvice = document.getElementById('trafficAdvice');
// 측정소 개수 및 메타 정보 표시 요소
const trafficMeta = document.getElementById('trafficMeta');
// 안내 및 로딩 상태 메시지 표시 박스
const statusMessage = document.getElementById('statusMessage');
// 측정소 목록 상단 기준 시각 안내 요소
const standardTimeText = document.getElementById('standardTimeText');
// 측정소 카드들이 동적으로 추가될 그리드 컨테이너
const cardsGrid = document.getElementById('cardsGrid');
// 차트가 위치한 섹션 컨테이너
const chartSection = document.getElementById('chartSection');

// 시/도 드롭다운 변경 시 실행되는 이벤트 리스너 등록
sidoSelect.addEventListener('change', (event) => {
    // 선택된 시/도 이름 가져오기
    const selectedSido = event.target.value;
    // 해당 지역의 미세먼지 데이터 요청 함수 호출
    fetchAirQualityData(selectedSido);
});

// 페이지가 완전히 로드되면 기본값(서울)으로 데이터 요청
window.addEventListener('DOMContentLoaded', () => {
    // 초기 로딩 시 기본 설정된 시/도 값으로 API 호출
    fetchAirQualityData(sidoSelect.value);
});

// Vercel 서버리스 함수(/api/dust)를 호출하여 대기 정보를 가져오는 비동기 함수
async function fetchAirQualityData(sidoName) {
    // 로딩 상태 UI로 전환
    setLoadingState(sidoName);

    try {
        // 내부 서버리스 API 엔드포인트로 쿼리 파라미터 전달하여 호출
        const response = await fetch(`${INTERNAL_API_URL}?sido=${encodeURIComponent(sidoName)}`);

        // 응답 본문을 JSON 객체로 파싱
        const data = await response.json();

        // 응답 상태 코드가 정상이 아니거나 에러 메시지가 담겨있는 경우
        if (!response.ok) {
            // 서버에서 전달한 한국어 에러 메시지 또는 기본 문구 예외 발생
            throw new Error(data.error || `서버 오류 (상태 코드: ${response.status})`);
        }

        // API 응답 데이터 유효성 검사 (items 배열 존재 여부)
        const items = data?.response?.body?.items;
        if (!items || items.length === 0) {
            // 데이터가 비어있을 때 안내 메시지 표시
            showStatusMessage(`[${sidoName}] 지역의 실시간 측정 데이터가 없습니다.`);
            // 신호등 카드 초기화
            resetTrafficCard();
            // 차트 숨기기
            destroyChart();
            return;
        }

        // 정상 데이터가 수신되면 상태 메시지 숨김
        hideStatusMessage();

        // 측정소 목록을 기반으로 평균 미세먼지 계산 및 신호등 UI 업데이트
        updateTrafficLight(items, sidoName);

        // 수치 높은 순으로 상위 10개 측정소 가로 막대그래프 렌더링
        renderTopDustChart(items);

        // 각 측정소별 카드를 화면에 렌더링
        renderStationCards(items);

    } catch (error) {
        // 오류 발생 시 콘솔에 상세 내용 기록
        console.error('API 호출 중 오류 발생:', error);
        // 서버에서 전달한 한국어 에러 메시지를 화면에 명확하게 표시
        showStatusMessage(`${error.message}`);
        // 신호등 카드 초기화
        resetTrafficCard();
        // 차트 초기화
        destroyChart();
    }
}

// 데이터를 불러오는 동안 표시되는 로딩 UI 설정 함수
function setLoadingState(sidoName) {
    // 기존 카드 내용 비우기
    cardsGrid.innerHTML = '';
    // 상단 지역 이름 표시
    selectedAreaText.textContent = `${sidoName} 실시간 대기질`;
    // 신호등 이모지를 모래시계로 변경
    trafficEmoji.textContent = '⏳';
    // 상태 텍스트를 '불러오는 중...'으로 변경
    trafficStatusText.textContent = '불러오는 중...';
    // 숫자 수치 초기화
    averagePm10Value.textContent = '-';
    // 생활 권고 안내문 초기화
    trafficAdvice.textContent = '최신 공기 정보를 받아오고 있습니다...';
    // 메타 정보 초기화
    trafficMeta.textContent = '잠시만 기다려주세요';
    // 기준 시각 초기화
    standardTimeText.textContent = '조회 중...';
    // 신호등 카드 클래스를 loading으로 설정
    trafficCard.className = 'traffic-card loading';
    // 상태 메시지 표시
    showStatusMessage(`[${sidoName}] 지역의 공기 정보를 불러오는 중입니다...`);
    // 이전 차트 인스턴스 파괴
    destroyChart();
}

// 지역 내 유효한 측정소들의 평균을 계산하고 신호등 UI를 갱신하는 함수
function updateTrafficLight(items, sidoName) {
    // 유효한 측정값들의 합계 변수
    let sum = 0;
    // 유효한 측정소 개수 카운트 변수
    let validCount = 0;
    // 가장 최근 측정 시각 저장 변수
    let latestDataTime = '';

    // 전달받은 모든 측정소 데이터를 순회
    items.forEach((item) => {
        // 미세먼지 수치 원본 문자열 가져오기
        const rawValue = item.pm10Value;
        // 값이 '-' 가 아니고 비어있지 않으며 숫자로 변환 가능한지 확인
        if (rawValue && rawValue !== '-' && !isNaN(Number(rawValue))) {
            // 수치 누적 더하기
            sum += Number(rawValue);
            // 유효 측정소 카운트 증가
            validCount++;
        }
        // 최근 측정 시각 확인
        if (!latestDataTime && item.dataTime) {
            latestDataTime = item.dataTime;
        }
    });

    // 최근 측정 시각을 한국어 포맷('2026년 10월 28일 16시 기준')으로 변환하여 표시
    if (latestDataTime) {
        standardTimeText.textContent = formatKoreanDateTime(latestDataTime);
    } else {
        standardTimeText.textContent = '';
    }

    // 유효한 측정값이 1개 이상 존재하는 경우 평균 계산 및 신호등 업데이트
    if (validCount > 0) {
        // 평균 미세먼지 수치 계산 (반올림하여 정수 표시)
        const avg = Math.round(sum / validCount);
        // 큰 숫자로 평균 수치 표시
        averagePm10Value.textContent = avg;

        // 평균 수치에 따른 신호등 정보(이모지, 상태텍스트, 테마, 마스크 권고) 가져오기
        const trafficInfo = getTrafficSignalInfo(avg);

        // 큰 신호등 이모지 반영 (🔵🟢🟠🔴)
        trafficEmoji.textContent = trafficInfo.emoji;
        // 대표 상태 텍스트 반영 (좋음 / 보통 / 나쁨 / 매우나쁨)
        trafficStatusText.textContent = trafficInfo.statusText;
        // 한 줄 권고 문구 반영 (나쁨 이상 시 '외출 시 마스크를 챙기세요')
        trafficAdvice.textContent = trafficInfo.adviceText;
        // 메타 정보 표시 (측정소 개수)
        trafficMeta.textContent = `${sidoName} 측정소 ${validCount}곳 평균`;
        // 신호등 카드 테마 클래스 적용
        trafficCard.className = `traffic-card ${trafficInfo.themeClass}`;
    } else {
        // 유효한 수치가 전혀 없는 경우
        resetTrafficCard();
        trafficStatusText.textContent = '측정 불가';
        trafficAdvice.textContent = '현재 해당 지역의 측정 데이터가 없습니다.';
        trafficMeta.textContent = '유효 측정소 0곳';
    }
}

// 미세먼지 수치에 따라 신호등 이모지, 상태 문구, 마스크 권고, 테마 반환 함수
function getTrafficSignalInfo(pm10) {
    // 환경부 기준: 0 ~ 30 좋음
    if (pm10 <= 30) {
        return {
            emoji: '🔵',                         // 파란색 이모지
            statusText: '좋음',                 // 상태 명칭
            adviceText: '공기가 깨끗해요! 환기하기 좋은 날이에요.', // 생활 권고
            themeClass: 'theme-good'             // CSS 테마 클래스
        };
    // 환경부 기준: 31 ~ 80 보통
    } else if (pm10 <= 80) {
        return {
            emoji: '🟢',                         // 초록색 이모지
            statusText: '보통',                 // 상태 명칭
            adviceText: '무난한 공기질이에요. 야외 활동하기 괜찮아요.', // 생활 권고
            themeClass: 'theme-normal'           // CSS 테마 클래스
        };
    // 환경부 기준: 81 ~ 150 나쁨 (마스크 챙기기 권고 필수)
    } else if (pm10 <= 150) {
        return {
            emoji: '🟠',                         // 주황색 이모지
            statusText: '나쁨',                 // 상태 명칭
            adviceText: '외출 시 마스크를 챙기세요', // 나쁨 이상 권고 문구
            themeClass: 'theme-bad'              // CSS 테마 클래스
        };
    // 환경부 기준: 151 이상 매우나쁨 (마스크 챙기기 권고 필수)
    } else {
        return {
            emoji: '🔴',                         // 빨간색 이모지
            statusText: '매우나쁨',             // 상태 명칭
            adviceText: '외출 시 마스크를 챙기세요', // 나쁨 이상 권고 문구
            themeClass: 'theme-verybad'          // CSS 테마 클래스
        };
    }
}

// Chart.js를 사용해 미세먼지 상위 10개 측정소를 가로 막대그래프로 그리는 함수
function renderTopDustChart(items) {
    // 캔버스 엘리먼트 가져오기
    const canvas = document.getElementById('topDustChart');
    if (!canvas) return;

    // '측정 안 됨'(-) 제외하고 유효한 수치를 가진 측정소만 필터링
    const validStations = items.filter((item) => {
        const val = item.pm10Value;
        return val && val !== '-' && !isNaN(Number(val));
    });

    // 유효한 측정소가 없으면 차트 숨김
    if (validStations.length === 0) {
        chartSection.style.display = 'none';
        return;
    }

    // 차트 섹션 보이기
    chartSection.style.display = 'block';

    // 미세먼지 수치 기준 내림차순 정렬 (높은 순서대로)
    validStations.sort((a, b) => Number(b.pm10Value) - Number(a.pm10Value));

    // 상위 10개 측정소만 추출
    const top10 = validStations.slice(0, 10);

    // 차트 레이블(측정소명) 배열 생성
    const labels = top10.map(item => item.stationName || '미확인');
    // 차트 데이터(미세먼지 수치) 배열 생성
    const dataValues = top10.map(item => Number(item.pm10Value));
    // 각 막대의 색상을 등급 색상(파랑/초록/주황/빨강)과 동일하게 매칭
    const backgroundColors = top10.map(item => getBarColorByGrade(item.pm10Grade, Number(item.pm10Value)));

    // 기존 차트가 있다면 파괴하여 캔버스 재사용
    destroyChart();

    // 2D 렌더링 컨텍스트 가져오기
    const ctx = canvas.getContext('2d');

    // Chart.js 수평 막대그래프 인스턴스 생성
    topDustChartInstance = new Chart(ctx, {
        type: 'bar', // 막대그래프 타입
        data: {
            labels: labels, // Y축에 들어갈 측정소 이름들
            datasets: [{
                label: '미세먼지 농도 (PM10)', // 데이터셋 라벨
                data: dataValues,               // X축 데이터 값들
                backgroundColor: backgroundColors, // 등급별 일치 색상
                borderRadius: 8,                // 막대 끝 둥글게
                borderSkipped: false,           // 모든 모서리 둥글게
                barPercentage: 0.7              // 막대 두께 비율
            }]
        },
        options: {
            indexAxis: 'y',                     // 가로 막대그래프로 설정!
            responsive: true,                   // 반응형 활성화
            maintainAspectRatio: false,         // 부모 컨테이너 높이에 맞춤
            animation: {
                duration: 600,                  // 부드러운 전환 애니메이션
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    display: false              // 단일 데이터셋이므로 범례 숨김
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)', // 어두운 툴팁 배경
                    padding: 10,
                    titleFont: { family: 'Pretendard Variable', size: 13, weight: 'bold' },
                    bodyFont: { family: 'Pretendard Variable', size: 12 },
                    callbacks: {
                        label: (context) => ` 미세먼지: ${context.parsed.x} ㎍/㎥` // 툴팁 단위 한국어 표기
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,          // 0부터 시작
                    grid: {
                        color: 'rgba(226, 232, 240, 0.6)' // 연한 가로 눈금선
                    },
                    ticks: {
                        font: { family: 'Pretendard Variable', size: 11 },
                        color: '#64748b'
                    }
                },
                y: {
                    grid: {
                        display: false          // Y축 격자선 숨김
                    },
                    ticks: {
                        font: { family: 'Pretendard Variable', size: 13, weight: '700' },
                        color: '#1e293b'
                    }
                }
            }
        }
    });
}

// 등급 코드(또는 수치)에 따라 막대그래프 색상 코드를 반환하는 함수
function getBarColorByGrade(grade, pm10Value) {
    // 1등급: 좋음 (파란색)
    if (grade === '1' || (!grade && pm10Value <= 30)) {
        return '#2563eb';
    // 2등급: 보통 (초록색)
    } else if (grade === '2' || (!grade && pm10Value <= 80)) {
        return '#16a34a';
    // 3등급: 나쁨 (주황색)
    } else if (grade === '3' || (!grade && pm10Value <= 150)) {
        return '#ea580c';
    // 4등급: 매우나쁨 (빨간색)
    } else if (grade === '4' || (!grade && pm10Value > 150)) {
        return '#dc2626';
    // 미측정/알 수 없음 (회색)
    } else {
        return '#94a3b8';
    }
}

// 차트 인스턴스 파괴 및 초기화 함수
function destroyChart() {
    // 차트가 존재하면 파괴
    if (topDustChartInstance) {
        topDustChartInstance.destroy();
        topDustChartInstance = null;
    }
}

// 각 측정소의 정보를 카드로 생성하여 화면에 렌더링하는 함수
function renderStationCards(items) {
    // 기존 카드 내용 비우기
    cardsGrid.innerHTML = '';

    // 각 측정소 데이터를 순회하며 카드 DOM 생성
    items.forEach((item) => {
        // 측정소 이름 (기본값 설정)
        const stationName = item.stationName || '측정소명 없음';
        // 측정 일시 한국어 포맷 변환
        const formattedTime = formatKoreanDateTime(item.dataTime);

        // 미세먼지(PM10) 수치 처리: '-' 이거나 값이 없으면 '측정 안 됨'으로 표시
        const pm10Display = formatValue(item.pm10Value, '㎍/㎥');
        // 초미세먼지(PM25) 수치 처리: '-' 이거나 값이 없으면 '측정 안 됨'으로 표시
        const pm25Display = formatValue(item.pm25Value, '㎍/㎥');

        // 미세먼지 등급(pm10Grade)에 따른 스타일 클래스 및 등급 라벨 가져오기
        const gradeClass = getGradeClass(item.pm10Grade);
        // 등급 이름 라벨 가져오기
        const gradeLabel = getGradeLabel(item.pm10Grade);

        // 카드 요소 생성
        const card = document.createElement('div');
        // 공통 카드 클래스 및 등급별 은은한 테마 클래스 부여
        card.className = `station-card ${gradeClass}`;

        // 카드의 내부 HTML 구조 작성
        card.innerHTML = `
            <!-- 카드 헤더: 측정소 이름 및 등급 뱃지 -->
            <div class="card-header">
                <span class="station-name">${escapeHtml(stationName)}</span>
                <span class="grade-badge">${gradeLabel}</span>
            </div>
            <!-- 카드 본문: 미세먼지 및 초미세먼지 측정값 -->
            <div class="card-body">
                <div class="data-row">
                    <span class="data-label">미세먼지 (PM10)</span>
                    <span class="data-value ${pm10Display === '측정 안 됨' ? 'none' : ''}">${pm10Display}</span>
                </div>
                <div class="data-row">
                    <span class="data-label">초미세먼지 (PM2.5)</span>
                    <span class="data-value ${pm25Display === '측정 안 됨' ? 'none' : ''}">${pm25Display}</span>
                </div>
            </div>
            <!-- 카드 푸터: 한국어 측정 시각 표시 -->
            <div class="card-footer">
                ${escapeHtml(formattedTime)}
            </div>
        `;

        // 생성한 카드를 그리드 컨테이너에 추가
        cardsGrid.appendChild(card);
    });
}

// 측정 일시 문자열('2026-11-03 12:00')을 '2026년 11월 3일 12시 기준' 형식으로 변환하는 함수
function formatKoreanDateTime(dateStr) {
    // 문자열이 비어있는 경우 기본 문구 반환
    if (!dateStr || typeof dateStr !== 'string') {
        return '측정 시각 정보 없음';
    }

    // 정규식으로 연, 월, 일, 시 파싱
    const match = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):\d{2}$/);
    if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const day = parseInt(match[3], 10);
        const hour = parseInt(match[4], 10);
        // 한국어 포맷으로 조합하여 반환
        return `${year}년 ${month}월 ${day}일 ${hour}시 기준`;
    }

    // 포맷이 다를 경우 원본 뒤에 '기준' 추가하여 반환
    return `${dateStr} 기준`;
}

// 측정값 형식화 함수 ('-' 이거나 비어있으면 '측정 안 됨' 반환)
function formatValue(value, unit) {
    // 값이 없거나 공백이거나 '-' 인 경우
    if (!value || value === '-' || value.trim() === '') {
        // '측정 안 됨' 안내 텍스트 반환
        return '측정 안 됨';
    }
    // 정상 수치인 경우 단위와 함께 반환
    return `${value} ${unit}`;
}

// 등급 코드(1, 2, 3, 4)를 CSS 클래스명으로 변환하는 함수
function getGradeClass(grade) {
    // 등급 값에 따른 클래스 분기
    switch (String(grade)) {
        case '1':
            return 'grade-1'; // 1등급: 좋음 (파랑)
        case '2':
            return 'grade-2'; // 2등급: 보통 (초록)
        case '3':
            return 'grade-3'; // 3등급: 나쁨 (주황)
        case '4':
            return 'grade-4'; // 4등급: 매우나쁨 (빨강)
        default:
            return 'grade-unknown'; // 등급 값이 비어있거나 기타인 경우 (회색)
    }
}

// 등급 코드를 한글 텍스트 라벨로 변환하는 함수
function getGradeLabel(grade) {
    // 등급 값에 따른 한글 텍스트 분기
    switch (String(grade)) {
        case '1':
            return '좋음';
        case '2':
            return '보통';
        case '3':
            return '나쁨';
        case '4':
            return '매우나쁨';
        default:
            return '정보 없음'; // 등급 값이 비어있을 때 표시
    }
}

// 신호등 카드 초기화 함수
function resetTrafficCard() {
    // 이모지 중립 표시
    trafficEmoji.textContent = '⚪';
    // 상태 초기화
    trafficStatusText.textContent = '-';
    // 숫자 초기화
    averagePm10Value.textContent = '-';
    // 권고 문구 초기화
    trafficAdvice.textContent = '-';
    // 메타 정보 초기화
    trafficMeta.textContent = '';
    // 테마 클래스 초기화
    trafficCard.className = 'traffic-card';
}

// 상태 안내 메시지 표시 함수
function showStatusMessage(message) {
    // 메시지 텍스트 삽입
    statusMessage.textContent = message;
    // 화면에 보이도록 스타일 변경
    statusMessage.style.display = 'block';
}

// 상태 안내 메시지 숨김 함수
function hideStatusMessage() {
    // 화면에서 숨기기
    statusMessage.style.display = 'none';
    // 텍스트 비우기
    statusMessage.textContent = '';
}

// XSS 방지를 위한 HTML 특수문자 이스케이프 함수
function escapeHtml(text) {
    // 빈 값 체크
    if (!text) return '';
    // 특수문자를 안전한 HTML 엔티티로 치환
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 알록달록 활기찬 파스텔 네온 색상 팔레트
const BUBBLE_COLORS = [
  { border: 'rgba(255, 110, 187, 0.75)', shadow: 'rgba(255, 110, 187, 0.4)' }, // 네온 핑크
  { border: 'rgba(0, 206, 201, 0.85)', shadow: 'rgba(0, 206, 201, 0.45)' },    // 네온 민트 (스카이블루)
  { border: 'rgba(253, 203, 110, 0.8)', shadow: 'rgba(253, 203, 110, 0.4)' },   // 네온 골드 (옐로우)
  { border: 'rgba(162, 155, 254, 0.8)', shadow: 'rgba(162, 155, 254, 0.4)' }    // 네온 라벤더 (퍼플)
];

// 상태 관리 객체
const state = {
  messages: [],
  maxActiveBubbles: 10, // 화면에 동시에 떠 있을 최대 버블 개수 (10개로 상향)
  activeBubbleCount: 0,
  deleteMode: false,
  nextIndex: 0 // 다음에 순차 스폰할 메시지의 인덱스
};

// 1. URL 쿼리 파라미터 감지를 통한 화면 모드 판별 (?view=screen 일 때만 대형 전광판 모드)
const urlParams = new URLSearchParams(window.location.search);
const isScreenView = urlParams.get('view') === 'screen';
const viewModeClass = isScreenView ? 'view-screen' : 'view-mobile';
document.body.classList.add(viewModeClass);

// DOM 요소 선택
const bubbleContainer = document.getElementById('bubbleContainer');
const guestbookForm = document.getElementById('guestbookForm');
const visitorNameInput = document.getElementById('visitorName');
const visitorMessageInput = document.getElementById('visitorMessage');
const deleteModeBtn = document.getElementById('deleteModeBtn');
const ipAddressText = document.getElementById('ipAddress');

// 2. Socket.io 실시간 연결 개시
const socket = io();

// 서버로부터 초기 기동 데이터(방명록 목록, 로컬 IP 주소) 수신
socket.on('init_data', (data) => {
  state.messages = data.messages;
  
  if (isScreenView) {
    // A. 스크린 전광판 모드일 때: 접속용 도메인/IP 주소 동적 추출 및 노출
    // 클라이언트가 현재 접속해 있는 브라우저 주소를 기준으로 생성하므로, 로컬 및 Render 배포 환경 모두에 자동으로 맞춤 연동됩니다.
    const baseAddress = window.location.origin;
    
    // 화면 표시용 주소 (프로토콜 제거)
    ipAddressText.textContent = baseAddress.replace(/^https?:\/\//, '');

    // QR코드 이미지 URL 세팅 (무료 오픈 QR코드 생성 API 이용)
    const qrCodeImg = document.getElementById('qrCodeImg');
    if (qrCodeImg) {
      qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(baseAddress)}`;
      qrCodeImg.style.display = 'block';
    }

    // 버블 물리 엔진 작동 개시
    startBubbleEngine();

    // Render 무료 플랜 잠자기 방지용 셀프 루프 핑 개시 (5분 간격)
    startSelfPingLoop();
  }
});

// Render 무료 플랜 생명 유지용 핑 함수 추가
function startSelfPingLoop() {
  const sendPing = () => {
    fetch('/ping')
      .then(res => console.log('[Self-Ping] Keep-alive request sent successfully.'))
      .catch(err => console.error('[Self-Ping] Request failed:', err));
  };
  
  sendPing();
  setInterval(sendPing, 5 * 60 * 1000); // 5분
}

// 실시간: 다른 사용자가 신규 방명록을 등록했을 때
socket.on('message_added', (newPost) => {
  state.messages.push(newPost);
  
  // 대형 화면 모드일 때만 즉각 하단에서 버블 퐁퐁 띄워줌
  if (isScreenView) {
    createBubble(newPost.id, newPost.name, newPost.message, false);
  }
});

// 실시간: 관리자가 방명록을 영구 삭제했을 때
socket.on('message_deleted', (id) => {
  state.messages = state.messages.filter(msg => msg.id !== id);
  
  // 순차 인덱스가 줄어든 배열 범위를 벗어나지 않도록 보정
  if (state.messages.length > 0) {
    state.nextIndex = state.nextIndex % state.messages.length;
  } else {
    state.nextIndex = 0;
  }
  
  if (isScreenView) {
    // 화면에 떠돌아다니는 버블 중 해당 ID를 가진 래퍼를 찾아 즉시 폭발시킴
    const targetWrappers = document.querySelectorAll('.bubble-wrapper');
    targetWrappers.forEach(wrapper => {
      if (wrapper.dataset.id === id) {
        popBubble(wrapper); // 톡 터지게 유도
      }
    });
  }
});

// 랜덤 값 범위 생성기 함수
function getRandom(min, max) {
  return Math.random() * (max - min) + min;
}

// 등록된 순서대로 메시지를 하나씩 순환하며 가져오는 함수
function getNextSequentialMessage() {
  if (state.messages.length === 0) return null;

  const msg = state.messages[state.nextIndex];

  // 인덱스 순환 처리 (끝에 도달하면 다시 0으로)
  state.nextIndex = (state.nextIndex + 1) % state.messages.length;

  return msg;
}

// 버블 요소 생성 함수
function createBubble(id, name, message, isInitial = false) {
  // 이미 화면에 동일 ID의 버블이 기동 중이고, 등록된 총 글수가 최대 개수(10개) 이상인 경우에만 중복 방지
  const existing = document.querySelector(`.bubble-wrapper[data-id="${id}"]`);
  if (existing && state.messages.length >= state.maxActiveBubbles) {
    // 중복으로 인해 생성이 생략되면 즉시 다음 순서 버블 스폰을 재시도
    setTimeout(spawnNextBubble, 50);
    return;
  }

  state.activeBubbleCount++;

  const wrapper = document.createElement('div');
  wrapper.className = 'bubble-wrapper';
  wrapper.dataset.id = id; // 엘리먼트에 고유 ID 부여해 타겟 제어 용이하게 함

  // 무작위 속성 설정
  const baseSize = Math.max(110, Math.min(170, message.length * 6 + 90));
  const size = getRandom(baseSize, baseSize + 20); 
  const left = getRandom(5, 85);
  const speed = getRandom(12, 20);
  const delay = isInitial ? getRandom(0, 8) : 0;
  const wobbleSpeed = getRandom(3, 5);
  const wobbleDelay = getRandom(0, 3);
  const wobbleRange = getRandom(15, 30);

  // 무작위 네온 컬러 초이스
  const colorIndex = Math.floor(Math.random() * BUBBLE_COLORS.length);
  const selectedColor = BUBBLE_COLORS[colorIndex];

  // CSS 변수 적용
  wrapper.style.setProperty('--size', `${size}px`);
  wrapper.style.setProperty('--left', `${left}%`);
  wrapper.style.setProperty('--speed', `${speed}s`);
  wrapper.style.setProperty('--delay', `${delay}s`);
  wrapper.style.setProperty('--wobble-speed', `${wobbleSpeed}s`);
  wrapper.style.setProperty('--wobble-delay', `${wobbleDelay}s`);
  wrapper.style.setProperty('--wobble-range', `${wobbleRange}px`);
  wrapper.style.setProperty('--bubble-glow-border', selectedColor.border);
  wrapper.style.setProperty('--bubble-glow-shadow', selectedColor.shadow);

  // HTML 내용 구성
  wrapper.innerHTML = `
    <div class="bubble-item">
      <span class="bubble-name">${escapeHTML(name)}</span>
      <span class="bubble-message">${escapeHTML(message)}</span>
    </div>
  `;

  // 버블 클릭 시 이벤트 바인딩
  wrapper.addEventListener('click', () => {
    if (wrapper.classList.contains('pop')) return;
    
    if (state.deleteMode) {
      // 1. 삭제 모드일 때: 소켓을 통해 서버 데이터에서 완전 삭제 요청
      socket.emit('delete_message', id);
    } else {
      // 2. 일반 모드일 때: 톡 터지기 인터랙션 (서버엔 보존하고 내 화면에서만 터뜨려 다음 루프로 순환)
      popBubble(wrapper);
    }
  });

  // 애니메이션이 끝나면(화면 위로 나갔을 때) 버블 제거하고 새 버블 공급
  wrapper.addEventListener('animationend', (event) => {
    if (event.animationName === 'rise' || wrapper.classList.contains('pop')) {
      destroyBubble(wrapper);
    }
  });

  bubbleContainer.appendChild(wrapper);
}

// 버블 파괴 및 다음 버블 스폰
function destroyBubble(bubbleElement) {
  if (bubbleElement && bubbleElement.parentNode) {
    bubbleElement.parentNode.removeChild(bubbleElement);
    state.activeBubbleCount--;
    // 무한 루프 유지: 사라진 버블을 대체하기 위해 아래에서 새 버블을 띄움
    spawnNextBubble();
  }
}

// 일반 버블 터뜨리기 효과 실행 (데이터 보존)
function popBubble(bubbleElement) {
  bubbleElement.classList.add('pop');
  setTimeout(() => {
    destroyBubble(bubbleElement);
  }, 300);
}

// 다음 버블 순차 스폰 (무한 루프 엔진)
function spawnNextBubble() {
  if (!isScreenView) return; // 전광판 모드에서만 버블 스폰 구동
  const currentLimit = Math.min(state.maxActiveBubbles, state.messages.length);
  if (state.activeBubbleCount < currentLimit && state.messages.length > 0) {
    const data = getNextSequentialMessage();
    if (data) {
      createBubble(data.id, data.name, data.message, false);
    }
  }
}

// 초기 화면 버블 순차 로드
function startBubbleEngine() {
  if (!isScreenView) return;
  const currentLimit = Math.min(state.maxActiveBubbles, state.messages.length);
  for (let i = 0; i < currentLimit; i++) {
    const data = getNextSequentialMessage();
    if (data) {
      createBubble(data.id, data.name, data.message, true);
    }
  }
}

// 모바일: 방명록 등록 폼 제출 핸들러
if (guestbookForm) {
  guestbookForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = visitorNameInput.value.trim();
    const message = visitorMessageInput.value.trim();

    if (!name || !message) return;

    // 소켓을 통해 로컬 서버로 실시간 등록 송신
    socket.emit('new_message', { name, message });

    // 입력 폼 비우기 및 포커스 해제
    visitorNameInput.value = '';
    visitorMessageInput.value = '';
    visitorMessageInput.blur();
    visitorNameInput.blur();
  });
}

// 스크린: 우측 하단 플로팅 삭제 토글 버튼 이벤트 등록
if (deleteModeBtn) {
  deleteModeBtn.addEventListener('click', () => {
    state.deleteMode = !state.deleteMode;
    deleteModeBtn.classList.toggle('active', state.deleteMode);
    document.body.classList.toggle('delete-mode-active', state.deleteMode);
  });
}

// HTML 이스케이프 유틸리티 (XSS 방지)
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

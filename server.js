const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = 3000;
const userDataPath = process.env.USER_DATA_PATH || __dirname;
const DB_FILE = path.join(userDataPath, 'guestbook_db.json');

// 정적 파일 서빙 (프로젝트 내 HTML, CSS, JS, 배경 이미지 등)
app.use(express.static(__dirname));

// Render 무료 플랜 잠자기(Spin Down) 방지용 하트비트 라우터
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// 로컬 네트워크 IPv4 주소 동적 획득 함수 (와이파이/이더넷 어댑터 탐색)
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost'; // 감지 실패 시 기본값
}

const LOCAL_IP = getLocalIPAddress();
console.log(`\n======================================================`);
console.log(`🚀 [실시간 수련회 방명록 서버 시작]`);
console.log(`💻 메인 대형화면 (A): http://localhost:${PORT}/?view=screen`);
console.log(`📱 학생들 접속주소 (B): http://${LOCAL_IP}:${PORT}`);
console.log(`======================================================\n`);

// DB 파일 읽기 헬퍼
function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify([]));
      return [];
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('DB 파일 읽기 오류:', err);
    return [];
  }
}

// DB 파일 쓰기 헬퍼
function writeDB(messages) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(messages, null, 2));
  } catch (err) {
    console.error('DB 파일 쓰기 오류:', err);
  }
}

// Socket.io 통신 이벤트 바인딩
io.on('connection', (socket) => {
  // 1. 신규 연결 시: 기존 데이터베이스 방명록과 서버 로컬 IP 전달
  const messages = readDB();
  socket.emit('init_data', {
    messages,
    localIP: LOCAL_IP,
    port: PORT
  });

  // 2. 신규 방명록 등록 수신
  socket.on('new_message', (data) => {
    if (!data.name || !data.message) return;

    const messages = readDB();
    
    // 고유 ID 안전 장치 추가
    const newPost = {
      id: data.id || 'msg_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
      name: data.name.trim(),
      message: data.message.trim(),
      timestamp: Date.now()
    };

    messages.push(newPost);
    writeDB(messages);

    // 연결된 모든 브라우저에 브로드캐스트하여 버블 생성 이벤트 발생시킴
    io.emit('message_added', newPost);
    console.log(`[등록] ${newPost.name}: ${newPost.message}`);
  });

  // 3. 방명록 영구 삭제 수신 (압정 모드 작동 시)
  socket.on('delete_message', (id) => {
    if (!id) return;

    let messages = readDB();
    const beforeCount = messages.length;
    messages = messages.filter(msg => msg.id !== id);
    
    if (messages.length !== beforeCount) {
      writeDB(messages);
      // 모든 브라우저에 삭제된 소식 전송하여 화면 내 버블 파괴 처리 유도
      io.emit('message_deleted', id);
      console.log(`[삭제] ID: ${id} 데이터가 데이터베이스에서 영구 삭제되었습니다.`);
    }
  });
});

// 서버 실행
server.listen(PORT, '0.0.0.0', () => {
  if (process.send) {
    process.send({ status: 'ready', localIP: LOCAL_IP, port: PORT });
  }
});

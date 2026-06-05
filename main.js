const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

// V8 JIT 최적화 컴파일러 버그로 인한 macOS EXC_BREAKPOINT 크래시 방지 스위치 강제 적용
app.commandLine.appendSwitch('js-flags', '--jitless');

let serverProcess = null;
let mainWindow = null;
let serverReady = false;

// 백그라운드 Express/Socket.io 서버 기동 함수
function startServer() {
  const serverPath = path.join(__dirname, 'server.js');
  
  // 환경 변수로 userData 경로를 전달하여 asar 패키징 후에도 DB 파일에 쓸 수 있도록 함
  serverProcess = fork(serverPath, [], {
    env: { ...process.env, USER_DATA_PATH: app.getPath('userData') }
  });

  serverProcess.on('message', (msg) => {
    if (msg.status === 'ready') {
      console.log(`[Electron] 로컬 서버 기동 성공: http://localhost:${msg.port}`);
      serverReady = true;
      if (!mainWindow) {
        createWindow();
      }
    }
  });

  serverProcess.on('error', (err) => {
    console.error('[Electron] 서버 프로세스 에러:', err);
  });
}

function createWindow() {
  if (mainWindow) return;

  // 메인 브라우저 창 생성
  mainWindow = new BrowserWindow({
    width: 950,
    height: 780,
    minWidth: 600,
    minHeight: 500,
    title: '2026 중고등부 학생수련회 - 방명록',
    // macOS에서 세련된 타이틀바 연출 (신호등 버튼만 남기고 타이틀바 제거)
    titleBarStyle: 'hiddenInset', 
    backgroundColor: '#0b0914', // 로딩 전 깜빡임(White flash) 방지용 앱 배경색 매칭
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 로컬 호스팅 서버 주소 로드 (?view=screen 옵션으로 메인 전광판 모드 동작 유도)
  mainWindow.loadURL('http://localhost:3000/?view=screen');

  // 로딩 완료 후 우아하게 윈도우 표시
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startServer(); // 서버 선기동

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0 && serverReady) {
      createWindow();
    }
  });
});

app.on('window-all-closed', function () {
  // 앱 종료 시 백그라운드 서버 프로세스도 안전하게 동시 종료
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') app.quit();
});

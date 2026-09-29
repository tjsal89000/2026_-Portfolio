import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // nginx 리버스프록시가 이 앱을 http://localhost/dashboard/ 경로로 서빙하므로,
  // Vite가 만드는 정적 자산(JS/CSS) 경로도 그 하위 경로 기준으로 맞춰야 함
  base: '/dashboard/',
  server: {
    host: true, // 0.0.0.0으로 바인딩 - 도커 컨테이너(nginx)에서도 접근 가능하게
    // HMR(핫리로드) 웹소켓이 리버스프록시를 거쳐도 브라우저 기준 실제 접속 경로로 연결되게 함
    hmr: {
      path: '/dashboard/',
      clientPort: 80,
    },
  },
})

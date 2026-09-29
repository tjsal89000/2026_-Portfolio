// 대시보드는 항상 nginx 게이트웨이를 통해 서빙된다는 전제 위에서(로컬이든, EC2의 k8s NodePort든
// - 어느 쪽이든 "지금 이 페이지를 보고 있는 주소"가 곧 nginx 주소다), 절대 URL을 하드코딩하지
// 않고 window.location을 기준으로 만든다.
//
// 예전엔 "http://localhost"를 하드코딩해뒀는데, 로컬에서는 우연히 맞아서 문제가 없다가
// EC2(16.x.x.x:30080)에 배포하니 브라우저가 그 문자열 그대로 "자기 자신의 localhost"로
// 요청을 보내버려서 전부 깨졌다 - 페이지가 실제로 어디서 열렸는지와 무관하게 항상 같은 주소로
// 요청하도록 고정해놨던 게 원인. window.location.origin은 브라우저가 지금 이 페이지를 연
// 실제 주소를 그대로 반영하므로, 로컬/EC2/이후 도메인이 붙어도 코드 변경 없이 항상 맞는다.
export const API_ORIGIN = window.location.origin;
export const WS_ORIGIN = API_ORIGIN.replace(/^http/, "ws");

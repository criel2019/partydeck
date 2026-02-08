# 🎲 파티덱 (PartyDeck)

서버 없이 즐기는 P2P 미니게임 플랫폼

## 🎮 게임 목록
- 🃏 **텍사스 홀덤 포커** - 블라인드, 레이즈, 쇼다운 완전 구현
- 🕵️ **마피아 게임** - 마피아/의사/경찰/시민 역할, 밤/낮 페이즈
- 🎴 **섯다** - (준비 중)

## 🏗️ 아키텍처
- **호스트 = 서버**: 방을 만든 사람의 기기가 게임 로직을 처리
- **WebRTC P2P**: PeerJS를 통해 브라우저 간 직접 통신
- **시그널링만 무료 서버**: PeerJS Cloud (처음 연결 시에만 사용)
- **서버 비용: 0원**

## 🚀 GitHub Pages 배포 방법

### 방법 1: GitHub 웹에서 직접 (가장 쉬움)

1. GitHub에 로그인
2. 우측 상단 `+` → `New repository` 클릭
3. Repository name: `partydeck` 입력
4. `Public` 선택 → `Create repository`
5. `uploading an existing file` 클릭
6. `index.html`과 `manifest.json` 파일을 드래그 & 드롭
7. `Commit changes` 클릭
8. 레포지토리 → `Settings` → 좌측 `Pages`
9. Source: `Deploy from a branch` 선택
10. Branch: `main` / `/ (root)` 선택 → `Save`
11. 1~2분 후 `https://당신의아이디.github.io/partydeck/` 으로 접속!

### 방법 2: Git CLI 사용

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/당신의아이디/partydeck.git
git push -u origin main
```
그 후 Settings → Pages에서 배포 설정

## 📱 사용 방법

1. 한 사람이 **방 만들기** 클릭 → 5자리 방 코드 생성
2. 코드를 친구에게 공유 (링크 공유 버튼 지원)
3. 친구들이 코드 입력 후 **참가**
4. 호스트가 게임 선택 → **게임 시작**!

## 💰 수익화

`index.html`에서 광고 배너 영역이 준비되어 있습니다:

```html
<!-- Google AdSense 코드로 교체 -->
<div class="ad-banner">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-YOUR_ID" crossorigin="anonymous"></script>
  <ins class="adsbygoogle" data-ad-client="ca-pub-YOUR_ID" data-ad-slot="YOUR_SLOT"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>
```

## 📋 기술 스택
- HTML/CSS/JS (프레임워크 없음, 단일 파일)
- PeerJS (WebRTC 래퍼)
- PWA 지원 (홈 화면에 추가 가능)
- localStorage (프로필/전적 저장)

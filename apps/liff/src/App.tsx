import logo from './assets/logo.png';

/** Session 0 shell. The receipt-submission flow is built in Session 8. */
export function App() {
  return (
    <main className="screen">
      <img src={logo} alt="GET POINT" className="logo" />
      <h1>สแกนใบเสร็จ</h1>
      <p className="muted">เพิ่มใบเสร็จ แล้วรับแต้มจากการช้อป</p>
      <p className="notice">หน้านี้จะพัฒนาใน Session 8</p>
    </main>
  );
}

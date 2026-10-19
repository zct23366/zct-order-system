import { Outlet } from 'react-router-dom';
import { CartProvider } from '@/contexts/CartContext';

export default function UserLayout() {
  return (
    <CartProvider>
      {/* ✨ 散景光斑系统——7个多层次的虚化光环 */}
      <div className="ambient-lights" aria-hidden="true">
        <div className="ambient-light bokeh--gold-primary" />
        <div className="ambient-light bokeh--amber-large" />
        <div className="ambient-light bokeh--gold-mid" />
        <div className="ambient-light bokeh--cream-soft" />
        <div className="ambient-light bokeh--copper-small" />
        <div className="ambient-light bokeh--gold-micro-1" />
        <div className="ambient-light bokeh--gold-micro-2" />
      </div>

      {/* min-h-screen 用的是 100vh（浏览器工具栏收起时的最大高度），比 100dvh 高出一截，
          菜单页那种 height:100dvh 的整屏布局因此会让 body 多出可滚动余量——一滚动，
          Safari/Chrome 的地址栏就带着模糊+渐变压到页面顶部，看起来顶栏被糊住。
          这里统一改用 100dvh，页面不再能上下拖动。 */}
      <div className="relative z-10 min-h-[100dvh] bg-background">
        <Outlet />
      </div>
    </CartProvider>
  );
}

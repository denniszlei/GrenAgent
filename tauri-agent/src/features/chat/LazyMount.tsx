import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface LazyMountProps {
  children: ReactNode;
  /** 未渲染前的占位高度（px）：撑出滚动空间，渲染后即由真实内容高度接管。 */
  estimate?: number;
}

// 已渲染态用 display:contents——包裹 div 从布局中「消失」，子组件等效为父 flex 容器的直接子项，
// 保住用户消息右对齐等依赖 flex-child 的样式（普通包裹 div 会破坏 align-self / margin-auto）。
const SHOWN_STYLE: CSSProperties = { display: 'contents' };

/**
 * React 层「可见才渲染」虚拟化：消息进入（或接近 rootMargin）视口前只占位、不渲染其重型
 * markdown 子树；进入后渲染并停止观察（渲染后固定，来回滚动不重渲）。
 *
 * 解决「切换会话时一次性同步渲染整列重型 markdown 阻塞主线程」——切换后只渲染可见的几条，
 * 其余先占位，主线程不再被几十条 markdown 解析卡死，也不必靠 deferred 显示旧内容。
 */
export function LazyMount({ children, estimate = 100 }: LazyMountProps) {
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      // 提前 1200px 渲染：滚动时内容已就绪、避免「滚到才空一下」。
      { rootMargin: '1200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <div ref={ref} style={shown ? SHOWN_STYLE : { minHeight: estimate }}>
      {shown ? children : null}
    </div>
  );
}

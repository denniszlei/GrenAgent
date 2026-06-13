import { Flexbox } from '@lobehub/ui';
import type { ReactNode } from 'react';

interface ManagerLayoutProps {
  header: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  testId?: string;
}

const border = '1px solid var(--gren-border, rgba(255,255,255,0.08))';

export function ManagerLayout({ header, list, detail, testId }: ManagerLayoutProps) {
  return (
    <Flexbox data-testid={testId ?? 'manager-layout'} style={{ height: '100%', minHeight: 0 }}>
      <div style={{ padding: '10px 14px', borderBottom: border, flex: '0 0 auto' }}>{header}</div>
      <Flexbox horizontal flex={1} style={{ minHeight: 0 }}>
        <div
          style={{
            width: 260,
            flex: '0 0 auto',
            height: '100%',
            overflowY: 'auto',
            borderRight: border,
          }}
        >
          {list}
        </div>
        <div style={{ flex: 1, minWidth: 0, height: '100%', overflowY: 'auto', padding: 14 }}>
          {detail}
        </div>
      </Flexbox>
    </Flexbox>
  );
}

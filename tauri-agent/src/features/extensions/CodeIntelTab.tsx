import { Button, Flexbox } from '@lobehub/ui';
import { Select, Switch, Tooltip } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { Brain, ChevronDown, ChevronRight, Hammer, Play, RotateCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { codeIntelInit, codeIntelReindex, codeIntelStatus, codeIntelSync } from '../../lib/codeIntelIo';
import { useAgentStoreContext } from '../../stores/AgentStoreContext';
import { ModelSelectField } from '../settings/ModelSelectField';
import { parseAnsi, parseCodegraphStatus } from './ansi';
import { userConfiguredCodegraph } from './codeIntelYield';

const mono = 'ui-monospace, SFMono-Regular, "Cascadia Code", Menlo, Consolas, monospace';

const styles = createStaticStyles(({ css }) => ({
  hero: css`
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-block-end: 18px;
  `,
  heroIcon: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    border-radius: 10px;
    background: ${cssVar.colorFillTertiary};
    color: ${cssVar.colorText};
  `,
  heroTitle: css`
    font-size: 17px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  heroDesc: css`
    margin-block-start: 3px;
    font-size: 12.5px;
    line-height: 1.55;
    color: ${cssVar.colorTextSecondary};
  `,
  card: css`
    margin-block-end: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};
    overflow: hidden;
  `,
  cardHead: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 11px 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  cardTitle: css`
    font-size: 13px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  cardBody: css`
    padding: 14px 16px;
  `,
  row: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  `,
  rowLabel: css`
    font-size: 13px;
    color: ${cssVar.colorText};
  `,
  rowDesc: css`
    margin-block-start: 2px;
    font-size: 11.5px;
    line-height: 1.5;
    color: ${cssVar.colorTextTertiary};
  `,
  divided: css`
    margin-block-start: 14px;
    padding-block-start: 14px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  engineBadge: css`
    padding: 1px 9px;
    border-radius: 999px;
    background: ${cssVar.colorWarningBg};
    color: ${cssVar.colorWarning};
    font-size: 11px;
    white-space: nowrap;
    cursor: default;
  `,
  statePill: css`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
  `,
  statePillOk: css`
    background: ${cssVar.colorSuccessBg};
    color: ${cssVar.colorSuccess};
  `,
  statePillIdle: css`
    background: ${cssVar.colorFillSecondary};
    color: ${cssVar.colorTextTertiary};
  `,
  dot: css`
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  `,
  toolbar: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  `,
  statGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 8px;
    margin-block-start: 14px;
  `,
  statCard: css`
    padding: 10px 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 10px;
    background: ${cssVar.colorFillQuaternary};
  `,
  statValue: css`
    font-family: ${mono};
    font-size: 18px;
    font-weight: 650;
    line-height: 1.2;
    color: ${cssVar.colorText};
    font-variant-numeric: tabular-nums;
  `,
  statLabel: css`
    margin-block-start: 3px;
    font-size: 10.5px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${cssVar.colorTextTertiary};
  `,
  detailList: css`
    margin-block-start: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  `,
  detailItem: css`
    display: flex;
    gap: 10px;
    font-size: 11.5px;
    line-height: 1.5;
  `,
  detailKey: css`
    flex: 0 0 auto;
    min-width: 58px;
    color: ${cssVar.colorTextTertiary};
  `,
  detailVal: css`
    min-width: 0;
    color: ${cssVar.colorTextSecondary};
    font-family: ${mono};
    word-break: break-all;
  `,
  rawBar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-block-start: 14px;
  `,
  rawToggle: css`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: none;
    background: transparent;
    color: ${cssVar.colorTextSecondary};
    font-size: 12px;
    cursor: pointer;
    transition: color 0.16s ease;

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  log: css`
    margin: 8px 0 0;
    padding: 12px 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    background: #0e1116;
    color: #abb2bf;
    font-family: ${mono};
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 260px;
    overflow: auto;
  `,
  empty: css`
    margin-block-start: 14px;
    padding: 18px;
    border: 1px dashed ${cssVar.colorBorderSecondary};
    border-radius: 10px;
    text-align: center;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

interface CodeIntelTabProps {
  values: Record<string, string>;
  setValue: (key: string, value: string) => void;
  /** 标记有改动（触发自动存盘 + 重启生效提示）。 */
  onChange: () => void;
  /** 当前已连 MCP 工具名（用于让位徽标，来自 tools cache 汇总）。 */
  knownToolNames: string[];
}

const ENGINE_OPTIONS = [
  { value: 'codegraph', label: 'CodeGraph（内置，默认）' },
  { value: 'gitnexus', label: 'GitNexus（opt-in，Phase 4）' },
  { value: 'off', label: '关闭' },
];

export function CodeIntelTab({ values, setValue, onChange, knownToolNames }: CodeIntelTabProps) {
  const { workspace } = useAgentStoreContext();
  const engine = values.CODE_INTEL ?? 'codegraph';
  const autoInit = (values.CODE_INTEL_AUTO_INIT ?? '1') !== '0';
  const explorerOn = (values.CODE_INTEL_EXPLORER ?? '1') !== '0';
  const yielded = userConfiguredCodegraph(values.MCP_SERVERS ?? '', knownToolNames);

  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const parsed = useMemo(() => parseCodegraphStatus(status), [status]);
  const logSegments = useMemo(() => parseAnsi(status), [status]);
  const loaded = status.trim().length > 0;

  const refreshStatus = async () => {
    setBusy('status');
    try {
      setStatus(await codeIntelStatus(workspace));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  const run = async (kind: 'init' | 'sync' | 'reindex') => {
    setBusy(kind);
    try {
      const fn = kind === 'init' ? codeIntelInit : kind === 'sync' ? codeIntelSync : codeIntelReindex;
      setStatus(await fn(workspace));
      await refreshStatus();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const setEngine = (v: string) => {
    setValue('CODE_INTEL', v);
    onChange();
  };
  const toggleAutoInit = (on: boolean) => {
    setValue('CODE_INTEL_AUTO_INIT', on ? '1' : '0');
    onChange();
  };
  const toggleExplorer = (on: boolean) => {
    setValue('CODE_INTEL_EXPLORER', on ? '1' : '0');
    onChange();
  };
  const setExplorerModel = (v: string) => {
    setValue('CODE_INTEL_EXPLORER_MODEL', v);
    onChange();
  };

  const details = [
    ...(parsed.project ? [{ label: 'Project', value: parsed.project }] : []),
    ...parsed.details,
  ];
  const rawVisible = showRaw || !parsed.indexed;

  const renderLog = () => (
    <pre className={styles.log} data-testid="code-intel-status">
      {logSegments.map((seg, i) => (
        <span
          key={`${i}-${seg.text.length}`}
          style={{
            color: seg.color,
            fontWeight: seg.bold ? 600 : undefined,
            opacity: seg.dim ? 0.7 : undefined,
          }}
        >
          {seg.text}
        </span>
      ))}
    </pre>
  );

  return (
    <div data-testid="code-intel-tab">
      <div className={styles.hero}>
        <span className={styles.heroIcon}>
          <Brain size={19} />
        </span>
        <div>
          <div className={styles.heroTitle}>代码智能</div>
          <div className={styles.heroDesc}>
            基于 CodeGraph 的离线代码图谱：为 agent 提供符号检索、调用关系与只读探索能力，索引与查询全部本地完成。
          </div>
        </div>
      </div>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>引擎</span>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.row}>
            <div>
              <div className={styles.rowLabel}>代码图谱引擎</div>
              <div className={styles.rowDesc}>CodeGraph 为内置离线引擎；切换经热更新生效</div>
            </div>
            <Flexbox horizontal align="center" gap={8}>
              {yielded ? (
                <Tooltip title="检测到你已自配 codegraph MCP，内置引擎自动让位">
                  <span className={styles.engineBadge} data-testid="code-intel-badge">
                    内置让位
                  </span>
                </Tooltip>
              ) : null}
              <Select
                data-testid="code-intel-engine"
                size="small"
                value={engine}
                options={ENGINE_OPTIONS}
                style={{ minWidth: 188 }}
                onChange={setEngine}
              />
            </Flexbox>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>索引（当前 workspace）</span>
          <Flexbox horizontal align="center" gap={8}>
            {loaded ? (
              <span
                className={`${styles.statePill} ${parsed.indexed ? styles.statePillOk : styles.statePillIdle}`}
                data-testid="code-intel-state"
              >
                <span className={styles.dot} />
                {parsed.indexed ? '已索引' : '未索引'}
              </span>
            ) : null}
            <Button
              size="small"
              icon={<RotateCw size={14} />}
              loading={busy === 'status'}
              data-testid="code-intel-refresh"
              onClick={() => void refreshStatus()}
            >
              刷新
            </Button>
          </Flexbox>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.row}>
            <div>
              <div className={styles.rowLabel}>打开 workspace 时自动初始化</div>
              <div className={styles.rowDesc}>无 .codegraph 时后台自动 init（CODE_INTEL_AUTO_INIT）</div>
            </div>
            <Switch size="small" checked={autoInit} data-testid="code-intel-autoinit" onChange={toggleAutoInit} />
          </div>

          <div className={styles.divided}>
            <div className={styles.toolbar}>
              <Button
                type="primary"
                size="small"
                icon={<Play size={14} />}
                loading={busy === 'init'}
                data-testid="code-intel-init"
                onClick={() => void run('init')}
              >
                初始化
              </Button>
              <Button
                size="small"
                icon={<RotateCw size={14} />}
                loading={busy === 'sync'}
                data-testid="code-intel-sync"
                onClick={() => void run('sync')}
              >
                增量同步
              </Button>
              <Button
                size="small"
                icon={<Hammer size={14} />}
                loading={busy === 'reindex'}
                data-testid="code-intel-reindex"
                onClick={() => void run('reindex')}
              >
                重建
              </Button>
            </div>

            {!loaded ? (
              <div className={styles.empty}>尚未读取索引状态，点右上「刷新」查看统计</div>
            ) : (
              <>
                {parsed.stats.length > 0 ? (
                  <div className={styles.statGrid}>
                    {parsed.stats.map((s) => (
                      <div key={s.label} className={styles.statCard}>
                        <div className={styles.statValue}>{s.value}</div>
                        <div className={styles.statLabel}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {details.length > 0 ? (
                  <div className={styles.detailList}>
                    {details.map((d) => (
                      <div key={d.label} className={styles.detailItem}>
                        <span className={styles.detailKey}>{d.label}</span>
                        <span className={styles.detailVal}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {parsed.indexed ? (
                  <div className={styles.rawBar}>
                    <button
                      type="button"
                      className={styles.rawToggle}
                      data-testid="code-intel-raw-toggle"
                      onClick={() => setShowRaw((v) => !v)}
                    >
                      {showRaw ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      原始输出
                    </button>
                  </div>
                ) : null}

                {rawVisible ? renderLog() : null}
              </>
            )}
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>探索子代理</span>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.row}>
            <div>
              <div className={styles.rowLabel}>启用 explore_context</div>
              <div className={styles.rowDesc}>只读探索子代理；关闭后该工具不再注册（需重启生效）</div>
            </div>
            <Switch size="small" checked={explorerOn} data-testid="code-intel-explorer" onChange={toggleExplorer} />
          </div>
          <div className={`${styles.row} ${styles.divided}`}>
            <div>
              <div className={styles.rowLabel}>探索模型</div>
              <div className={styles.rowDesc}>留空＝子代理便宜模型（SUBAGENT_MODEL_CHEAP）</div>
            </div>
            <ModelSelectField
              value={values.CODE_INTEL_EXPLORER_MODEL ?? ''}
              placeholder="如 deepseek/deepseek-chat"
              testId="code-intel-explorer-model"
              onChange={setExplorerModel}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

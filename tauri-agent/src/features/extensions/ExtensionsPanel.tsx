import { Button, Flexbox } from '@lobehub/ui';
import { App, Dropdown, Popconfirm, Switch } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  Boxes,
  Brain,
  FileArchive,
  FileText,
  FolderInput,
  FolderOpen,
  Import,
  Plus,
  RefreshCw,
  ScrollText,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import { probeMcpServer, readMcpPolicy, readMcpToolsCache, writeMcpPolicy } from '../../lib/mcpPolicyIo';
import {
  createSkill,
  deleteSkill,
  importSkillFromDir,
  importSkillFromFile,
  installSkillFromZip,
  listSkills,
  openSkillsDir,
  type SkillInfo,
} from '../../lib/skillsIo';
import { useSettingsForm } from '../settings/useSettingsForm';
import { AddMcpModal } from './AddMcpModal';
import { AddSkillModal } from './AddSkillModal';
import { AuditModal } from './AuditModal';
import { CodeIntelTab } from './CodeIntelTab';
import { McpServerCard } from './McpServerCard';
import {
  listEntries,
  mergeImport,
  removeServer,
  setEnabled,
  upsertServer,
  type Collections,
  type McpConfig,
  type McpEntry,
} from './mcpConfig';
import { parsePolicyDoc, serializePolicyDoc, setToolPerm, setToolRules, type Perm } from './mcpPolicy';
import { getCacheEntry, getCachedTools, parseToolsCache, toProbeConfigJson, type CacheEntry } from './mcpToolsCache';
import { ToolPermissionModal } from './ToolPermissionModal';

const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function parseDisabled(csv: string): Set<string> {
  return new Set(
    csv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** 用 skill 名稳定推导一个色相，给头像生成专属渐变（高级感 + 易区分）。 */
function avatarBackground(name: string): string {
  let hue = 0;
  for (let i = 0; i < name.length; i += 1) hue = (hue * 31 + name.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${hue} 62% 56%), hsl(${(hue + 38) % 360} 64% 46%))`;
}

type ExtTab = 'mcp' | 'skills' | 'code-intel';

const styles = createStaticStyles(({ css }) => ({
  panel: css`
    height: 100%;
    min-height: 0;
  `,
  header: css`
    position: relative;
    z-index: 1;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    height: 46px;
    padding-inline: 14px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorBgContainer};
  `,
  tabBar: css`
    display: flex;
    align-items: stretch;
    height: 100%;
    gap: 2px;
  `,
  tab: css`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 100%;
    padding-inline: 10px;
    margin-block-end: -1px;
    border: none;
    border-block-end: 2px solid transparent;
    background: transparent;
    color: ${cssVar.colorTextTertiary};
    font-size: 13px;
    cursor: pointer;
    transition:
      color 0.16s ease,
      border-color 0.16s ease;

    &:hover {
      color: ${cssVar.colorTextSecondary};
    }
  `,
  tabActive: css`
    color: ${cssVar.colorText};
    font-weight: 600;
    border-block-end-color: ${cssVar.colorPrimary};
  `,
  errorBar: css`
    flex: 0 0 auto;
    padding: 8px 14px;
    background: ${cssVar.colorErrorBg};
    color: ${cssVar.colorError};
    font-size: 12px;
  `,
  body: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 20px 16px 32px;
  `,
  inner: css`
    width: 100%;
    max-width: 680px;
    margin-inline: auto;
  `,
  heroBar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  `,
  hero: css`
    display: flex;
    align-items: center;
    gap: 10px;
  `,
  heroIcon: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    border-radius: 10px;
    background: ${cssVar.colorFillTertiary};
    color: ${cssVar.colorText};
  `,
  heroTitle: css`
    display: inline-flex;
    align-items: center;
    font-size: 17px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  count: css`
    margin-inline-start: 8px;
    padding: 1px 8px;
    border-radius: 999px;
    background: ${cssVar.colorFillSecondary};
    color: ${cssVar.colorTextSecondary};
    font-size: 12px;
    font-weight: 500;
  `,
  heroDesc: css`
    margin-block: 8px 16px;
    font-size: 13px;
    line-height: 1.55;
    color: ${cssVar.colorTextSecondary};
  `,
  code: css`
    padding: 1px 5px;
    border-radius: 4px;
    background: ${cssVar.colorFillTertiary};
    font-family: ${mono};
    font-size: 11px;
  `,
  card: css`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 14px;
    margin-block-end: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};
    transition:
      transform 0.16s ease,
      border-color 0.16s ease,
      background 0.16s ease,
      box-shadow 0.16s ease;

    &:hover {
      transform: translateY(-1px);
      border-color: ${cssVar.colorBorder};
      background: ${cssVar.colorFillQuaternary};
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
    }
  `,
  name: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  avatar: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    border-radius: 10px;
    color: ${cssVar.colorTextLightSolid};
    font-size: 15px;
    font-weight: 600;
    text-transform: uppercase;
  `,
  meta: css`
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  `,
  desc: css`
    overflow: hidden;
    font-size: 11px;
    color: ${cssVar.colorTextTertiary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  empty: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 40px 0;
    border: 1px dashed ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    color: ${cssVar.colorTextTertiary};
    font-size: 12px;
  `,
  iconBtn: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: ${cssVar.colorTextTertiary};
    cursor: pointer;
    transition:
      background 0.16s ease,
      color 0.16s ease;

    &:hover {
      background: ${cssVar.colorErrorBg};
      color: ${cssVar.colorError};
    }
  `,
}));

export function ExtensionsPanel() {
  const { values, setValue, persist, loading, error } = useSettingsForm();
  const cols: Collections = {
    enabled: values.MCP_SERVERS ?? '',
    disabled: values.MCP_SERVERS_DISABLED ?? '',
  };
  const entries = listEntries(cols).sort((a, b) => Number(b.enabled) - Number(a.enabled));
  const existingNames = entries.map((e) => e.name);

  const { message } = App.useApp();
  const [tab, setTab] = useState<ExtTab>('mcp');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<McpEntry | undefined>(undefined);
  const touchedRef = useRef(false);
  const [policyRaw, setPolicyRaw] = useState<Record<string, unknown>>({});
  const [auditOpen, setAuditOpen] = useState(false);
  const [rulesTarget, setRulesTarget] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void readMcpPolicy()
      .then((t) => {
        if (!cancelled) setPolicyRaw(parsePolicyDoc(t));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const writePolicy = (next: Record<string, unknown>) => {
    setPolicyRaw(next);
    void writeMcpPolicy(serializePolicyDoc(next)).catch(() => {});
  };
  const onPermChange = (fullName: string, perm: Perm) => writePolicy(setToolPerm(policyRaw, fullName, perm));

  const [toolsCache, setToolsCache] = useState<Record<string, CacheEntry>>({});
  const [probing, setProbing] = useState<Set<string>>(new Set());

  const reloadCache = async () => {
    try {
      setToolsCache(parseToolsCache(await readMcpToolsCache()));
    } catch {
      // ignore: empty cache renders as 未探测
    }
  };

  const probeOne = async (serverName: string, serverConfig: McpConfig) => {
    setProbing((s) => new Set(s).add(serverName));
    try {
      await probeMcpServer(toProbeConfigJson(serverName, serverConfig));
    } catch {
      // probe failure is recorded in cache by the subcommand; ignore here
    } finally {
      await reloadCache();
      setProbing((s) => {
        const next = new Set(s);
        next.delete(serverName);
        return next;
      });
    }
  };

  // 打开面板：读缓存，并对「已启用但还没缓存过」的 server 自动探测一次（顺序执行，避免一次 spawn 一堆 npx）。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let cache: Record<string, CacheEntry> = {};
      try {
        cache = parseToolsCache(await readMcpToolsCache());
      } catch {
        cache = {};
      }
      if (cancelled) return;
      setToolsCache(cache);
      const toProbe = listEntries({
        enabled: values.MCP_SERVERS ?? '',
        disabled: values.MCP_SERVERS_DISABLED ?? '',
      }).filter((e) => e.enabled && !cache[e.name]);
      for (const e of toProbe) {
        if (cancelled) return;
        await probeOne(e.name, e.config);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const reloadSkills = useCallback(async () => {
    try {
      setSkills(await listSkills());
    } catch {
      // ignore: empty list renders the empty state
    }
  }, []);

  useEffect(() => {
    void reloadSkills();
  }, [reloadSkills]);

  // 改动后静默自动存盘（防抖）→ 写 runtime-settings.json。MCP/代码智能引擎由 mcp 管理器
  // fs.watch 增删改热更；技能/explore_context 由 PI_RELOAD_REV 触发 sidecar 内 session.reload()。均不重启。
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    if (loading || !touchedRef.current) return;
    const timer = window.setTimeout(() => void persistRef.current(), 600);
    return () => window.clearTimeout(timer);
  }, [
    values.MCP_SERVERS,
    values.MCP_SERVERS_DISABLED,
    values.SKILLS_DISABLED,
    values.PI_RELOAD_REV,
    values.CODE_INTEL,
    values.CODE_INTEL_AUTO_INIT,
    values.CODE_INTEL_EXPLORER,
    values.CODE_INTEL_EXPLORER_MODEL,
    loading,
  ]);

  const markChanged = () => {
    touchedRef.current = true;
  };
  // 资源类变更（技能开关/增删/导入、explore_context 开关）后 bump 此版本号写入
  // runtime-settings.json，触发 sidecar 内 session.reload() 重载技能/扩展与 system prompt，无需重启。
  const bumpReloadRev = () => setValue('PI_RELOAD_REV', String(Date.now()));

  const writeCols = (next: Collections) => {
    setValue('MCP_SERVERS', next.enabled);
    setValue('MCP_SERVERS_DISABLED', next.disabled);
    markChanged();
  };
  const handleSubmitForm = (entry: { name: string; config: McpConfig }, targetEnabled: boolean) =>
    writeCols(upsertServer(cols, entry, targetEnabled ? 'enabled' : 'disabled'));
  const handleSubmitImport = (servers: Array<{ name: string; config: McpConfig }>) =>
    writeCols(mergeImport(cols, servers).cols);
  const handleToggleMcp = (name: string, enabled: boolean) => writeCols(setEnabled(cols, name, enabled));
  const handleDeleteMcp = (name: string) => {
    if (window.confirm(`确认删除 MCP "${name}"？`)) writeCols(removeServer(cols, name));
  };

  // 归一到无前缀名：兼容旧版写进去的 `skill:xxx`，与磁盘上的裸名匹配。
  const bareSkillName = (name: string) => (name.startsWith('skill:') ? name.slice(6) : name);
  const disabled = new Set(Array.from(parseDisabled(values.SKILLS_DISABLED ?? '')).map(bareSkillName));
  const writeDisabled = (next: Set<string>) => setValue('SKILLS_DISABLED', Array.from(next).join(','));
  const toggleSkill = (name: string) => {
    const next = new Set(disabled);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    writeDisabled(next);
    bumpReloadRev();
    markChanged();
  };
  const handleCreateSkill = async (name: string, description: string, body: string) => {
    await createSkill(name, description, body);
    await reloadSkills();
    bumpReloadRev();
    markChanged();
  };
  const handleDeleteSkill = async (sk: SkillInfo) => {
    await deleteSkill(sk.path);
    if (disabled.has(sk.name)) {
      const next = new Set(disabled);
      next.delete(sk.name);
      writeDisabled(next);
    }
    await reloadSkills();
    bumpReloadRev();
    markChanged();
  };

  // 选路径 → 导入 → 刷新列表 + 提示。selected 为 null 表示用户取消选择。
  const runImport = async (selected: string | string[] | null, fn: (src: string) => Promise<SkillInfo>) => {
    if (typeof selected !== 'string') return;
    try {
      const sk = await fn(selected);
      await reloadSkills();
      bumpReloadRev();
      markChanged();
      message.success(`已导入技能「${sk.name}」`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const importZip = async () =>
    runImport(
      await openDialog({ multiple: false, filters: [{ name: 'Zip', extensions: ['zip'] }] }),
      installSkillFromZip,
    );
  const importDir = async () => runImport(await openDialog({ directory: true, multiple: false }), importSkillFromDir);
  const importFile = async () =>
    runImport(
      await openDialog({ multiple: false, filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] }),
      importSkillFromFile,
    );

  const handleOpenSkillsDir = async () => {
    try {
      await openSkillsDir();
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  // 手动重扫技能目录：用户把技能目录拷进 ~/.agents/skills 后点此重新加载列表，
  // 同时 bump reload rev 让 sidecar 热重载，新技能即时对 agent 生效（无需重启）。
  const handleRefreshSkills = async () => {
    setRefreshing(true);
    try {
      await reloadSkills();
      bumpReloadRev();
      markChanged();
      message.success('已刷新技能列表');
    } finally {
      setRefreshing(false);
    }
  };

  const importMenu = {
    items: [
      { key: 'zip', label: '从 Zip 安装', icon: <FileArchive size={14} />, onClick: () => void importZip() },
      { key: 'dir', label: '导入技能目录', icon: <FolderInput size={14} />, onClick: () => void importDir() },
      { key: 'file', label: '导入单文件 (SKILL.md)', icon: <FileText size={14} />, onClick: () => void importFile() },
    ],
  };

  return (
    <Flexbox className={styles.panel} data-testid="extensions-panel">
      <div className={styles.header}>
        <div className={styles.tabBar}>
          <button
            type="button"
            data-testid="ext-tab-mcp"
            className={`${styles.tab} ${tab === 'mcp' ? styles.tabActive : ''}`}
            onClick={() => setTab('mcp')}
          >
            <Boxes size={15} />
            插件
          </button>
          <button
            type="button"
            data-testid="ext-tab-skills"
            className={`${styles.tab} ${tab === 'skills' ? styles.tabActive : ''}`}
            onClick={() => setTab('skills')}
          >
            <Sparkles size={15} />
            技能
          </button>
          <button
            type="button"
            data-testid="ext-tab-code-intel"
            className={`${styles.tab} ${tab === 'code-intel' ? styles.tabActive : ''}`}
            onClick={() => setTab('code-intel')}
          >
            <Brain size={15} />
            代码智能
          </button>
        </div>
      </div>

      {error && <div className={styles.errorBar}>{error}</div>}

      <div className={styles.body}>
        <div className={styles.inner}>
          {tab === 'code-intel' ? (
            <CodeIntelTab
              values={values}
              setValue={setValue}
              onChange={markChanged}
              onReload={bumpReloadRev}
              knownToolNames={Object.values(toolsCache).flatMap((e) => e.toolNames)}
            />
          ) : tab === 'mcp' ? (
            <>
              <div className={styles.heroBar}>
                <div className={styles.hero}>
                  <span className={styles.heroIcon}>
                    <Boxes size={18} />
                  </span>
                  <span className={styles.heroTitle}>
                    MCP 服务器
                    {entries.length > 0 ? <span className={styles.count}>{entries.length}</span> : null}
                  </span>
                </div>
                <Flexbox horizontal align="center" gap={8}>
                  <Button
                    size="small"
                    icon={<ScrollText size={14} />}
                    data-testid="mcp-audit-open"
                    onClick={() => setAuditOpen(true)}
                  >
                    审计
                  </Button>
                  <Button
                    type="primary"
                    size="small"
                    data-testid="mcp-add"
                    icon={<Plus size={14} />}
                    onClick={() => {
                      setEditing(undefined);
                      setModalOpen(true);
                    }}
                  >
                    添加 MCP
                  </Button>
                </Flexbox>
              </div>
              <div className={styles.heroDesc}>
                连接外部 MCP server，其工具以 <code className={styles.code}>mcp__server__tool</code> 暴露给 agent。点「测试连接」获取工具并配置权限（即时生效）。
              </div>

              {entries.length === 0 ? (
                <div className={styles.empty} data-testid="mcp-empty">
                  <Boxes size={22} />
                  <span>未配置 MCP server，点右上「添加 MCP」</span>
                </div>
              ) : (
                entries.map((e) => (
                  <McpServerCard
                    key={e.name}
                    name={e.name}
                    config={e.config}
                    enabled={e.enabled}
                    cachedTools={getCachedTools(toolsCache, e.name)}
                    probing={probing.has(e.name)}
                    probeError={getCacheEntry(toolsCache, e.name)?.ok === false ? getCacheEntry(toolsCache, e.name)?.error : undefined}
                    policyRaw={policyRaw}
                    onToggle={(v) => handleToggleMcp(e.name, v)}
                    onEdit={() => {
                      setEditing(e);
                      setModalOpen(true);
                    }}
                    onDelete={() => handleDeleteMcp(e.name)}
                    onProbe={() => void probeOne(e.name, e.config)}
                    onPermChange={onPermChange}
                    onOpenRules={(full) => setRulesTarget(full)}
                  />
                ))
              )}

              <AddMcpModal
                open={modalOpen}
                editing={editing}
                existingNames={existingNames}
                onSubmitForm={handleSubmitForm}
                onSubmitImport={handleSubmitImport}
                onClose={() => setModalOpen(false)}
              />
              {rulesTarget ? (
                <ToolPermissionModal
                  open={!!rulesTarget}
                  fullName={rulesTarget}
                  policyRaw={policyRaw}
                  onSave={(full, perm, rules) =>
                    writePolicy(setToolRules(setToolPerm(policyRaw, full, perm), full, rules))
                  }
                  onClose={() => setRulesTarget(undefined)}
                />
              ) : null}
              <AuditModal open={auditOpen} onClose={() => setAuditOpen(false)} />
            </>
          ) : (
            <>
              <div className={styles.heroBar}>
                <div className={styles.hero}>
                  <span className={styles.heroIcon}>
                    <Sparkles size={18} />
                  </span>
                  <span className={styles.heroTitle}>
                    Skills
                    {skills.length > 0 ? <span className={styles.count}>{skills.length}</span> : null}
                  </span>
                </div>
                <Flexbox horizontal align="center" gap={8}>
                  <Button
                    size="small"
                    data-testid="skill-refresh"
                    icon={<RefreshCw size={14} />}
                    loading={refreshing}
                    onClick={() => void handleRefreshSkills()}
                  >
                    刷新
                  </Button>
                  <Button
                    size="small"
                    data-testid="skill-open-dir"
                    icon={<FolderOpen size={14} />}
                    onClick={() => void handleOpenSkillsDir()}
                  >
                    打开目录
                  </Button>
                  <Dropdown menu={importMenu} trigger={['click']}>
                    <Button size="small" data-testid="skill-import" icon={<Import size={14} />}>
                      导入
                    </Button>
                  </Dropdown>
                  <Button
                    type="primary"
                    size="small"
                    data-testid="skill-add"
                    icon={<Plus size={14} />}
                    onClick={() => setSkillModalOpen(true)}
                  >
                    新增技能
                  </Button>
                </Flexbox>
              </div>
              <div className={styles.heroDesc}>
                技能存于 <code className={styles.code}>~/.agents/skills</code>；关闭或增删后自动保存、即时生效（无需重启）；手动往该目录放技能后点「刷新」重新加载；可用 <code className={styles.code}>/skill:名称</code> 调用。
              </div>

              {skills.length === 0 ? (
                <div className={styles.empty} data-testid="skills-empty">
                  <Sparkles size={22} />
                  <span>未发现技能，点右上「新增技能」</span>
                </div>
              ) : (
                skills.map((sk) => {
                  const off = disabled.has(sk.name);
                  return (
                    <div key={sk.name} className={styles.card} data-testid={`skill-${sk.name}`}>
                      <span className={styles.avatar} style={{ background: avatarBackground(sk.name) }}>
                        {sk.name.slice(0, 1)}
                      </span>
                      <div className={styles.meta}>
                        <span className={styles.name}>{sk.name}</span>
                        {sk.description ? <span className={styles.desc}>{sk.description}</span> : null}
                      </div>
                      <Switch
                        size="small"
                        checked={!off}
                        onChange={() => toggleSkill(sk.name)}
                        data-testid={`skill-toggle-${sk.name}`}
                      />
                      <Popconfirm
                        title="永久删除技能"
                        description={`确定删除「${sk.name}」吗？将从磁盘移除整个文件夹，不可恢复。`}
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true, 'data-testid': `skill-delete-confirm-${sk.name}` }}
                        onConfirm={() => void handleDeleteSkill(sk)}
                      >
                        <button
                          type="button"
                          className={styles.iconBtn}
                          data-testid={`skill-delete-${sk.name}`}
                          title="永久删除"
                        >
                          <Trash2 size={15} />
                        </button>
                      </Popconfirm>
                    </div>
                  );
                })
              )}

              <AddSkillModal
                open={skillModalOpen}
                existingNames={skills.map((s) => s.name)}
                onSubmit={handleCreateSkill}
                onClose={() => setSkillModalOpen(false)}
              />
            </>
          )}
        </div>
      </div>
    </Flexbox>
  );
}

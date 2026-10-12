import { useEffect, useRef, useState } from 'react'
import { ChevronRight, FileText, Folder, FolderOpen, Link2, LoaderCircle, RefreshCw } from 'lucide-react'
import { t } from '@shared/i18n'
import type { SideQuestionScope } from '@shared/side-questions'
import type { Session, WorkspaceEntry } from '@shared/types'
import { useLocale } from '../lib/i18n'
import { requestOpenWorkspacePath } from '../lib/workspace-file-links'
import { useAppStore } from '../store/app-store'
import './InspectorFiles.css'

const PAGE_SIZE = 500

interface DirectoryPage {
  entries: WorkspaceEntry[]
  nextOffset: number
  hasMore: boolean
  loading: boolean
  error: string | null
}

export function InspectorFiles({ session, scope }: { session: Session | null; scope: SideQuestionScope }) {
  useLocale()
  const connected = useAppStore(state => state.connected && !state.switchingProfileId)
  const available = useAppStore(state => state.health?.capabilities?.workspace_files?.available === true)
  const capabilityMessage = useAppStore(state => {
    const capability = state.health?.capabilities?.workspace_files
    return [capability?.message, capability?.action].filter(Boolean).join(' ')
  })
  const message = !session?.cwd?.trim() ? t('editor.noWorkingDirectory')
    : !connected ? t('editor.workspaceFilesWillBeAvailableAfterAgentsserverFinishesConnecting')
      : !available ? capabilityMessage || t('editor.updateAgentsserverToEnableWorkspaceFileBrowsingAndEditing') : null
  if (message || !session) return <p className="inspector-files-message">{message}</p>
  // Remount on every owner/root change so cached folders and pending results
  // cannot migrate to another chat, connection generation or working directory.
  return <WorkspaceFileTree key={JSON.stringify([scope.profileId, scope.profileGeneration, scope.serverIdentity, session.id, session.cwd])}
    session={session} scope={scope} />
}

function WorkspaceFileTree({ session, scope }: { session: Session; scope: SideQuestionScope }) {
  const [root, setRoot] = useState(session.cwd ?? '')
  const [directories, setDirectories] = useState<Map<string, DirectoryPage>>(() => new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const directoriesRef = useRef(directories)
  const generation = useRef(0)
  const mounted = useRef(false)
  const rootRef = useRef<string | null>(null)

  function ownsWorkspace(): boolean {
    const state = useAppStore.getState()
    return mounted.current && state.connected && !state.switchingProfileId
      && state.activeProfileId === scope.profileId && state.profileGeneration === scope.profileGeneration
      && state.selectedSessionId === session.id
      && state.sessions.some(current => current.id === session.id && current.cwd === session.cwd)
  }

  function updateDirectory(path: string, page: DirectoryPage) {
    const next = new Map(directoriesRef.current).set(path, page)
    directoriesRef.current = next
    setDirectories(next)
  }

  async function loadDirectory(path: string, append = false) {
    if (!ownsWorkspace() || directoriesRef.current.get(path)?.loading) return
    const current = append ? directoriesRef.current.get(path) : undefined
    const pending: DirectoryPage = {
      entries: current?.entries ?? [], nextOffset: current?.nextOffset ?? 0,
      hasMore: current?.hasMore ?? false, loading: true, error: null
    }
    const requestGeneration = generation.current
    updateDirectory(path, pending)
    try {
      const page = await window.agentsDock.workspace.entries(session.id, path, pending.nextOffset, PAGE_SIZE)
      if (!ownsWorkspace() || requestGeneration !== generation.current) return
      if (rootRef.current !== null && rootRef.current !== page.root) throw new Error(t('inspector.filesRootChanged'))
      rootRef.current = page.root
      setRoot(page.root)
      const entries = new Map(pending.entries.map(entry => [entry.path, entry]))
      for (const entry of page.entries) entries.set(entry.path, entry)
      updateDirectory(path, {
        entries: [...entries.values()], nextOffset: page.offset + page.entries.length,
        hasMore: page.has_more && page.entries.length > 0, loading: false, error: null
      })
    } catch (error) {
      if (!ownsWorkspace() || requestGeneration !== generation.current) return
      updateDirectory(path, { ...pending, loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  useEffect(() => {
    mounted.current = true
    directoriesRef.current = new Map()
    void loadDirectory('')
    return () => { mounted.current = false; generation.current += 1 }
  }, [])

  function refresh() {
    if (!ownsWorkspace()) return
    generation.current += 1
    rootRef.current = null
    directoriesRef.current = new Map()
    setDirectories(directoriesRef.current)
    setExpanded(new Set())
    void loadDirectory('')
  }

  function toggle(path: string) {
    if (!ownsWorkspace()) return
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
    if (!directoriesRef.current.has(path)) void loadDirectory(path)
  }

  return <section className="inspector-files" aria-label={t('editor.workspaceFiles')}>
    <header className="inspector-files-header">
      <FolderOpen size={15} aria-hidden="true" />
      <span className="inspector-files-root" title={root}>{root}</span>
      <button type="button" className="icon-button" title={t('editor.refreshFileExplorer')} aria-label={t('editor.refreshFileExplorer')}
        onClick={refresh}><RefreshCw size={14} /></button>
    </header>
    <div className="inspector-files-scroll">
      <FileTreeDirectory path="" directories={directories} expanded={expanded} onToggle={toggle}
        onLoad={(path, append) => { void loadDirectory(path, append) }}
        onOpen={path => { if (ownsWorkspace()) requestOpenWorkspacePath(session.id, path) }} />
    </div>
  </section>
}

function FileTreeDirectory({ path, directories, expanded, onToggle, onLoad, onOpen }: {
  path: string; directories: Map<string, DirectoryPage>; expanded: Set<string>
  onToggle: (path: string) => void; onLoad: (path: string, append: boolean) => void; onOpen: (path: string) => void
}) {
  const directory = directories.get(path)
  return <>
    {!!directory?.entries.length && <ul className="inspector-files-list">
      {directory.entries.map(entry => <li key={entry.path}>
        {entry.kind === 'directory' ? <>
          <button type="button" className="inspector-files-row" aria-expanded={expanded.has(entry.path)} title={entry.path}
            onClick={() => onToggle(entry.path)}>
            <ChevronRight size={12} className={expanded.has(entry.path) ? 'expanded' : ''} aria-hidden="true" />
            <Folder size={14} aria-hidden="true" /><span>{entry.name}</span>
          </button>
          {expanded.has(entry.path) && <div className="inspector-files-children">
            <FileTreeDirectory path={entry.path} directories={directories} expanded={expanded} onToggle={onToggle} onLoad={onLoad} onOpen={onOpen} />
          </div>}
        </> : <button type="button" className="inspector-files-row inspector-files-file" disabled={entry.kind === 'symlink'}
          title={entry.kind === 'symlink' ? t('editor.symlinkUnavailable', { path: entry.path }) : entry.path}
          aria-label={t('editor.openNamed', { path: entry.path })} onClick={() => onOpen(entry.path)}>
          {entry.kind === 'symlink' ? <Link2 size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}<span>{entry.name}</span>
        </button>}
      </li>)}
    </ul>}
    {(!directory || directory.loading) && <p className="inspector-files-status" role="status"><LoaderCircle size={13} className="spin" aria-hidden="true" />{t('editor.loadingFiles')}</p>}
    {directory?.error && <div className="inspector-files-error" role="alert"><p>{directory.error}</p>
      <button type="button" className="quiet-button" onClick={() => onLoad(path, directory.entries.length > 0)}>{t('editor.retry')}</button>
    </div>}
    {directory && !directory.loading && !directory.error && (directory.hasMore
      ? <button type="button" className="quiet-button inspector-files-more" onClick={() => onLoad(path, true)}>{t('editor.loadMore')}</button>
      : directory.entries.length === 0 && <p className="inspector-files-status">{t('inspector.filesEmpty')}</p>)}
  </>
}

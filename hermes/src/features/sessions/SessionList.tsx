import { Plus } from 'lucide-react';
import { useSessionStore } from '../../store';
import { SessionItem } from './SessionItem';

interface SessionListProps {
  onCreateSession: () => Promise<void>;
  onSwitchSession: (path: string) => Promise<void>;
  onDeleteSession: (path: string) => Promise<void>;
}

export function SessionList({ onCreateSession, onSwitchSession, onDeleteSession }: SessionListProps) {
  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionPath = useSessionStore((state) => state.activeSessionPath);

  return (
    <div className="flex flex-col h-full bg-white border-r">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-bold">Sessions</h2>
        <button
          onClick={onCreateSession}
          className="p-2 hover:bg-gray-100 rounded"
          title="New Session"
        >
          <Plus size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.map((session) => (
          <SessionItem
            key={session.path}
            session={session}
            active={session.path === activeSessionPath}
            onSelect={() => onSwitchSession(session.path)}
            onDelete={() => onDeleteSession(session.path)}
          />
        ))}
      </div>
    </div>
  );
}

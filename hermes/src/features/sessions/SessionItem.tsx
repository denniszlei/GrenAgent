import { Trash2 } from 'lucide-react';
import type { SessionInfo } from '../../lib/types';

interface SessionItemProps {
  session: SessionInfo;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function SessionItem({ session, active, onSelect, onDelete }: SessionItemProps) {
  return (
    <div
      className={`flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 ${
        active ? 'bg-blue-50 border-l-4 border-blue-500' : ''
      }`}
      onClick={onSelect}
    >
      <div className="flex-1">
        <div className="font-medium">{session.name || 'Untitled'}</div>
        <div className="text-xs text-gray-500">
          {new Date(session.lastModified).toLocaleDateString()}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-2 hover:bg-red-100 rounded"
      >
        <Trash2 size={16} className="text-gray-600" />
      </button>
    </div>
  );
}

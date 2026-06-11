import type { ToolExecution as ToolExecutionType } from '../../lib/types';

interface ToolExecutionProps {
  execution: ToolExecutionType;
}

export function ToolExecution({ execution }: ToolExecutionProps) {
  const { toolName, params, status, result } = execution;

  const statusColor = {
    running: 'bg-blue-100 text-blue-800',
    success: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
  }[status];

  return (
    <div className={`my-2 p-3 rounded-lg border ${statusColor}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono font-bold text-sm">{toolName}</span>
        <span className="text-xs uppercase">{status}</span>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-gray-600">Parameters</summary>
        <pre className="mt-1 text-xs overflow-x-auto">
          {JSON.stringify(params, null, 2)}
        </pre>
      </details>

      {result && (
        <div className="mt-2 text-sm">
          <div className="font-medium mb-1">Result:</div>
          <pre className="text-xs bg-white p-2 rounded overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

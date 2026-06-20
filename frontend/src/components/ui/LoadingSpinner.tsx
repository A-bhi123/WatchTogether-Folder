import { Film } from 'lucide-react';

interface Props {
  fullScreen?: boolean;
  message?: string;
}

export default function LoadingSpinner({ fullScreen, message }: Props) {
  const content = (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div className="w-12 h-12 border-2 border-netflix-red/20 rounded-full" />
        <div className="w-12 h-12 border-2 border-t-netflix-red rounded-full animate-spin absolute inset-0" />
        <Film className="w-5 h-5 text-netflix-red absolute inset-0 m-auto" />
      </div>
      {message && <p className="text-netflix-gray text-sm">{message}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-netflix-dark flex items-center justify-center z-50">
        {content}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-8">
      {content}
    </div>
  );
}

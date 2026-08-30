import { useEffect, useState } from 'react';
import { BoardEditor } from './components/BoardEditor';
import { BoardsHome } from './components/BoardsHome';

type Route = { view: 'home' } | { view: 'board'; id: string } | { view: 'share'; token: string };

function parseHash(): Route {
  const board = /^#\/b\/([\w-]+)/.exec(location.hash);
  if (board) return { view: 'board', id: board[1] };
  const share = /^#\/s\/([0-9a-f]{32})/.exec(location.hash);
  if (share) return { view: 'share', token: share[1] };
  return { view: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  if (route.view === 'board') return <BoardEditor key={route.id} boardId={route.id} />;
  if (route.view === 'share') return <BoardEditor key={route.token} shareToken={route.token} />;
  return <BoardsHome />;
}

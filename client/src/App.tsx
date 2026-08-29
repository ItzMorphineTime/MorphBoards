import { useEffect, useState } from 'react';
import { BoardEditor } from './components/BoardEditor';
import { BoardsHome } from './components/BoardsHome';

type Route = { view: 'home' } | { view: 'board'; id: string };

function parseHash(): Route {
  const match = /^#\/b\/([\w-]+)/.exec(location.hash);
  if (match) return { view: 'board', id: match[1] };
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
  return <BoardsHome />;
}

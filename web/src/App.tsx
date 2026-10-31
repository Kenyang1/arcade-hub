import { Route, Routes } from 'react-router'
import Layout from './components/Layout.tsx'
import CatalogPage from './pages/CatalogPage.tsx'
import GameDetailsPage from './pages/GameDetailsPage.tsx'
import MySavesPage from './pages/MySavesPage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'
import PlayPage from './pages/PlayPage.tsx'
import SignInPage from './pages/SignInPage.tsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CatalogPage />} />
        <Route path="games/:gameId" element={<GameDetailsPage />} />
        <Route path="play/:gameId" element={<PlayPage />} />
        <Route path="saves" element={<MySavesPage />} />
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

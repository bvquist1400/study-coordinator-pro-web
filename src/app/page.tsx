import { redirect } from 'next/navigation'

export default function Home() {
  // Redirect root to the login page for now
  redirect('/login')
}


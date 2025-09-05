export function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, init)
}

export function jsonOf(res: Response) {
  return res.json() as Promise<any>
}


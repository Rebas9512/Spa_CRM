import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
          <div className="text-center space-y-4">
            <h1 className="text-xl font-bold text-gray-900">Something went wrong / 出错了</h1>
            <p className="text-gray-500">Please refresh the page to continue. / 请刷新页面继续。</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-[#0F766E] text-white font-medium rounded-lg"
            >
              Refresh / 刷新
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

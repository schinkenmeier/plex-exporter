export interface AdminState {
  currentView: string;
}

export function createState(): AdminState {
  return {
    currentView: 'dashboard'
  };
}

export interface AccountService {
  signOut(): Promise<void>;
  deleteAccount(confirmation: "EXCLUIR"): Promise<void>;
}

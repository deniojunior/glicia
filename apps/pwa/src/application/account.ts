export interface AccountService {
  deleteAccount(confirmation: "EXCLUIR"): Promise<void>;
}

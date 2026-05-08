import { UserAccount } from "../models/users";
import { Response, apiGet, FIREANT_API_URL } from "./common";

export async function getUserAccount(): Promise<Response<UserAccount>> {
  return await apiGet(`${FIREANT_API_URL}/me/account`);
}



export interface Passkey {
  id: string;
  name: string;
  rp_id: string;
  device_type: string | null;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
}

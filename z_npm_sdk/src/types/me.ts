export interface MeProfileDto {
  id?: string | number;
  displayName?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
}

export interface MeResponseDto {
  userId: string | number;
  profile?: MeProfileDto;
}

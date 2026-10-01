export interface Privacy {
  showOnline: boolean;
  birthdateVisibility: 'none' | 'day_month' | 'full';
  profileVisibility: 'everyone' | 'members';
  showAchievements: boolean;
  allowMessages: 'everyone' | 'nobody';
}

export interface EditableCustomField {
  id: number;
  key: string;
  name: string;
  description: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'url' | 'number' | 'date';
  options: string[];
  isRequired: boolean;
  maxLength: number;
  value: string;
}

export interface ProfileEditData {
  username: string;
  displayName: string;
  email: string;
  customTitle: string;
  bio: string;
  location: string;
  websiteUrl: string;
  birthdate: string;
  signature: string;
  avatarUrl: string | null;
  privacy: Privacy;
  timezone: string;
  theme: 'system' | 'light' | 'dark';
  usernameChangedAt: number | null;
  customFields: EditableCustomField[];
  limits: {
    bioMaxLength: number;
    customTitleMaxLength: number;
    signatureMaxLength: number;
    signatureMaxLines: number;
    avatarMaxKb: number;
    avatarSize: number;
    usernameCooldownDays: number;
  };
  can: { customTitle: boolean; signature: boolean; avatar: boolean; changeUsername: boolean; changeDisplayName: boolean };
}

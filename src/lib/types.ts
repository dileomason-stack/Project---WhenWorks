// Days are 0 = Monday ... 6 = Sunday. Times are minutes after midnight.
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type MeetingMode = "in_person" | "online";

export interface BusyBlock {
  day: number;
  start: number;
  end: number;
  label?: string;
}

export interface Member {
  id: string;
  name: string;
  busy: BusyBlock[];
  updatedAt: string;
}

export interface Group {
  id: string;
  name: string;
  mode: MeetingMode;
  meetingMinutes: number;
  days: number[];
  dayStart: number;
  dayEnd: number;
  createdAt: string;
  members: Member[];
}

// What the server stores: each member also has a secret key so only they can edit their schedule.
export interface StoredMember extends Member {
  editKey: string;
  addedAt?: string;
}

export interface StoredGroup extends Omit<Group, "members"> {
  members: StoredMember[];
  // Secret given to whoever created the group; needed to delete it.
  adminKey?: string;
}

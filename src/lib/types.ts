// Days are 0 = Monday ... 6 = Sunday. Times are minutes after midnight.
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type MeetingMode = "in_person" | "online";

export interface BusyBlock {
  day: number;
  start: number;
  end: number;
  label?: string;
  // Set for one-time events ("YYYY-MM-DD"); they only count in that week. Without it the event repeats weekly.
  date?: string;
}

export type Vote = "yes" | "no";

// A time someone suggested meeting at, on a specific date, with everyone's votes by member id.
export interface Proposal {
  id: string;
  date: string;
  start: number;
  end: number;
  createdAt: string;
  votes: Record<string, Vote>;
}

// The time the group settled on.
export interface Meeting {
  proposalId: string;
  date: string;
  start: number;
  end: number;
  location?: string;
  link?: string;
  confirmedAt: string;
}

export interface Member {
  id: string;
  name: string;
  busy: BusyBlock[];
  updatedAt: string;
  // The time zone this person's schedule is in. Without it, the schedule is in the group's time zone.
  timeZone?: string;
  // Whether the group can see event names. Off by default: others only see when someone is busy.
  shareDetails?: boolean;
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
  // The creator's time zone, so meeting invites land at the right time.
  timeZone?: string;
  // How many people are in the group, if the creator said.
  expectedCount?: number;
  members: Member[];
  proposals: Proposal[];
  meeting: Meeting | null;
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

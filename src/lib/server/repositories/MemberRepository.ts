import { BaseRepository } from "./base";
import type { Member } from "../notion/schema";
import * as notion from "../notion";

export class MemberRepository extends BaseRepository<Member> {
  async findByEmail(email: string, skipCache = false): Promise<Member | null> {
    return notion.getMemberByEmail(email, skipCache);
  }

  async findById(id: string): Promise<Member | null> {
    const member = await notion.getMemberById(id);
    return member as Member;
  }

  async findAll(skipCache = false): Promise<Member[]> {
    return notion.getAllMembers(skipCache);
  }

  async getPresident(): Promise<{ name: string; phone: string }> {
    const execs = await notion.getLatestExecutives();
    return execs.president;
  }
}

export const memberRepo = new MemberRepository();

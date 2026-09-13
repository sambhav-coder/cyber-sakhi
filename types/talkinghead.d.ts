/**
 * Minimal ambient declarations for the untyped TalkingHead runtime
 * (@met4citizen/talkinghead) and its English G2P lip-sync module.
 * The component treats the engine as `any` — these declarations only keep
 * `isolatedModules` / bundler resolution happy.
 */

declare module "@met4citizen/talkinghead" {
  export const TalkingHead: any;
}

declare module "@met4citizen/talkinghead/modules/lipsync-en.mjs" {
  export class LipsyncEn {
    preProcessText(text: string): string;
    wordsToVisemes(
      word: string
    ): {
      visemes: string[];
      times: number[];
      durations: number[];
    };
  }
}
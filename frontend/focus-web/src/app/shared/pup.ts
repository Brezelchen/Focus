import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { PetService } from '../core/pet.service';

export type PupMood = 'sleepy' | 'idle' | 'happy' | 'party';

/** The little mascot (a brown dog or a brown tabby cat). Its mood follows the day's progress. */
@Component({
  selector: 'app-pup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-mood]': 'mood()', '[attr.data-kind]': 'pet.kind()', role: 'img', '[attr.aria-label]': 'label()' },
  template: `
    <svg viewBox="0 0 120 100" [attr.width]="size()" [attr.height]="size() * 0.83">
      <ellipse class="shadow" cx="60" cy="92" rx="38" ry="5" />
      @if (pet.kind() === 'cat') {
        <g class="body-wrap cat">
          <path class="tail" d="M92 66 q20 -4 16 -32 q-1 -6 -6 -4" />
          <ellipse class="body" cx="66" cy="66" rx="29" ry="19" />
          <path class="stripe" d="M50 51 q4 7 0 13 M60 48 q4 8 -1 16 M72 47 q4 8 -1 17 M84 51 q3 7 -1 14 M93 59 q2 4 -1 8" />
          <path class="stripe" d="M104 50 l7 1 M105 40 l7 -1 M101 31 l6 -3" />
          <ellipse class="belly" cx="54" cy="74" rx="13" ry="9" />
          <rect class="leg" x="44" y="76" width="9" height="14" rx="4.5" />
          <rect class="leg" x="76" y="76" width="9" height="14" rx="4.5" />
          <rect class="toe" x="44" y="85" width="9" height="5" rx="2.5" />
          <rect class="toe" x="76" y="85" width="9" height="5" rx="2.5" />
          <g class="head">
            <path class="ear left" d="M22 36 L20 12 L38 26 Z" />
            <path class="inner" d="M24 32 L23 18 L33 26 Z" />
            <path class="ear right" d="M42 26 L58 10 L58 36 Z" />
            <path class="inner" d="M45 26 L55 16 L55 31 Z" />
            <ellipse class="face" cx="38" cy="46" rx="22" ry="19" />
            <path class="stripe" d="M32 30 l1 7 M38 29 v7 M44 30 l-1 7 M17 45 l6 1 M17 50 l5 0 M59 45 l-6 1 M59 50 l-5 0" />
            <ellipse class="muzzle" cx="34" cy="55" rx="10" ry="7" />
            <path class="nose" d="M30.5 50 h7 l-3.5 4 z" />
            @if (mood() === 'happy' || mood() === 'party') {
              <path class="mouth-open" d="M30 57 q4 6 8 0 z" />
            } @else {
              <path class="mouth" d="M29.5 57 q2.2 2.6 4.5 0 q2.3 2.6 4.5 0" />
            }
            <path class="whisker" d="M24 54 l-14 -3 M24 57 l-14 2 M44 54 l14 -3 M44 57 l14 2" />
            @if (mood() === 'sleepy') {
              <path class="eye-closed" d="M26 44 q4 3 8 0 M40 44 q4 3 8 0" />
            } @else {
              <ellipse class="iris" cx="30" cy="44" rx="3.6" ry="4" />
              <ellipse class="iris" cx="45" cy="44" rx="3.6" ry="4" />
              <ellipse class="pupil" cx="30" cy="44" rx="1.2" ry="3.2" />
              <ellipse class="pupil" cx="45" cy="44" rx="1.2" ry="3.2" />
            }
            <ellipse class="cheek" cx="47" cy="53" rx="3.6" ry="2.4" />
            @if (mood() === 'party') {
              <path class="hat" d="M30 30 l9 -24 l11 22 z" />
              <circle class="pom" cx="39" cy="6" r="3.5" />
            }
          </g>
        </g>
      } @else {
        <g class="body-wrap">
          <path class="tail" d="M92 62 q16 -6 14 -22" />
          <ellipse class="body" cx="66" cy="66" rx="30" ry="20" />
          <ellipse class="belly" cx="62" cy="74" rx="17" ry="9" />
          <rect class="leg" x="44" y="76" width="9" height="14" rx="4.5" />
          <rect class="leg" x="76" y="76" width="9" height="14" rx="4.5" />
          <g class="head">
            <ellipse class="face" cx="38" cy="46" rx="22" ry="20" />
            <ellipse class="snout" cx="26" cy="54" rx="11" ry="8" />
            <ellipse class="nose" cx="18" cy="51" rx="4" ry="3.2" />
            <path class="ear left" d="M44 30 q14 -2 12 22 q-10 2 -14 -8 z" />
            @if (mood() === 'sleepy') {
              <path class="eye-closed" d="M30 42 q4 3 8 0" />
            } @else {
              <circle class="eye" cx="34" cy="42" r="3.4" />
              <circle class="shine" cx="35.2" cy="40.8" r="1.1" />
            }
            @if (mood() === 'happy' || mood() === 'party') {
              <path class="tongue" d="M24 60 q3 8 7 0 z" />
            }
            <ellipse class="cheek" cx="40" cy="52" rx="4" ry="2.6" />
            <!-- inside the head group so it hops along with the dog -->
            @if (mood() === 'party') {
              <path class="hat" d="M32 28 l10 -24 l12 22 z" />
              <circle class="pom" cx="42" cy="4" r="3.5" />
            }
          </g>
        </g>
      }
      @if (mood() === 'sleepy') {
        <text class="z z1" x="8" y="26">z</text>
        <text class="z z2" x="2" y="14">z</text>
      }
    </svg>
  `,
  styles: `
    :host { display: inline-block; line-height: 0; }
    .shadow { fill: rgba(60, 30, 20, 0.12); }

    /* dog */
    .body, .face, .leg { fill: #a8673f; }
    .belly, .snout { fill: #e2b07e; }
    .ear { fill: #6e3f24; transform-box: fill-box; transform-origin: 20% 10%; }
    .nose, .eye { fill: #2b1a14; }
    .shine { fill: #fff; }
    .eye-closed { fill: none; stroke: #2b1a14; stroke-width: 2.2; stroke-linecap: round; }
    .cheek { fill: #f08a8a; opacity: 0.45; }
    .tongue { fill: #f07a8a; }
    .tail { fill: none; stroke: #8b522f; stroke-width: 7; stroke-linecap: round; transform-box: fill-box; transform-origin: 0% 100%; }

    /* cat */
    .cat .body, .cat .face, .cat .leg, .cat .ear { fill: #a8774c; }
    .cat .belly, .cat .muzzle, .cat .toe { fill: #f3e6d2; }
    .cat .inner { fill: #e7a9a9; }
    .cat .stripe { fill: none; stroke: #6a4429; stroke-width: 2.6; stroke-linecap: round; }
    .cat .tail { stroke: #95663f; stroke-width: 6.5; }
    .cat .nose { fill: #d98b8f; }
    .cat .mouth { fill: none; stroke: #5a5560; stroke-width: 1.4; stroke-linecap: round; }
    .cat .mouth-open { fill: #e07a86; }
    .cat .whisker { stroke: #b9b6c4; stroke-width: 1; stroke-linecap: round; }
    .cat .iris { fill: #9cc46a; }
    .cat .pupil { fill: #2b2a30; }
    .cat .eye-closed { stroke: #3b3a44; }
    .cat .ear.right { transform-origin: 30% 100%; }

    .hat { fill: #a17cff; }
    .pom { fill: #ffd36e; }
    .z { font: 700 12px var(--font-display); fill: var(--text-faint); animation: z 3s ease-in-out infinite; }
    .z2 { animation-delay: 1.5s; font-size: 9px; }
    .body-wrap { transform-box: fill-box; transform-origin: 50% 100%; animation: breathe 3.6s ease-in-out infinite; }
    :host([data-mood='sleepy']) .body-wrap { animation-duration: 5s; }
    :host([data-mood='idle']) .tail { animation: wag 1.6s ease-in-out infinite; }
    :host([data-mood='happy']) .tail { animation: wag 0.45s ease-in-out infinite; }
    :host([data-mood='party']) .tail { animation: wag 0.25s ease-in-out infinite; }
    :host([data-mood='party']) .body-wrap { animation: hop 0.9s var(--ease-spring) infinite; }
    :host([data-mood='happy']) .ear { animation: flop 1.2s ease-in-out infinite; }
    /* cats sway their tail slowly instead of wagging */
    :host([data-kind='cat'][data-mood='idle']) .tail { animation: sway 3s ease-in-out infinite; }
    :host([data-kind='cat'][data-mood='happy']) .tail { animation: sway 1.2s ease-in-out infinite; }
    :host([data-kind='cat'][data-mood='happy']) .ear { animation: none; }
    :host([data-kind='cat'][data-mood='happy']) .ear.right { animation: twitch 2.4s ease-in-out infinite; }
    @keyframes breathe { 50% { transform: scaleY(1.03); } }
    @keyframes wag { 0%, 100% { transform: rotate(-12deg); } 50% { transform: rotate(16deg); } }
    @keyframes sway { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(8deg); } }
    @keyframes twitch { 0%, 80%, 100% { transform: rotate(0); } 85% { transform: rotate(-14deg); } 90% { transform: rotate(4deg); } }
    @keyframes hop { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-9px); } }
    @keyframes flop { 50% { transform: rotate(-10deg); } }
    @keyframes z { 0% { opacity: 0; transform: translate(0, 4px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(-6px, -10px); } }
  `,
})
export class Pup {
  protected readonly pet = inject(PetService);
  readonly mood = input<PupMood>('idle');
  readonly size = input(96);
  protected readonly label = computed(() => {
    const who = this.pet.kind() === 'cat' ? 'kitty' : 'puppy';
    return { sleepy: `A sleepy ${who}`, idle: `A calm ${who}`, happy: `A happy ${who}`, party: `A ${who} celebrating` }[this.mood()];
  });
}

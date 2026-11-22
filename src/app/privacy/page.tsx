import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy — Wattle" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-5 py-4 text-sm leading-relaxed [&_h2]:pt-2 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
      <h1 className="text-2xl font-bold">Privacy</h1>
      <p className="text-muted">
        Wattle is a student project, not a service of any university. This page explains what
        it stores and why.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your sign-in email and name</strong> from Microsoft, Google, or the student email
          you entered, used only to sign you in.
        </li>
        <li>
          <strong>Your verified student email</strong>, used to confirm you&apos;re a student and to
          allow one account per student. Never shown to other players.
        </li>
        <li>
          <strong>The leaderboard name and faculty you choose.</strong> These are public on the
          leaderboards.
        </li>
        <li>
          <strong>Your games:</strong> your moves, answers, timings and scores, used to run the
          games, rank the leaderboards and spot cheating. Deep Cut answers may be counted in
          aggregate to work out which answers are rare.
        </li>
        <li>
          <strong>Sign-in sessions:</strong> a session cookie, plus the IP address and browser type
          recorded with each session, to keep you signed in and to investigate abuse.
        </li>
        <li>
          <strong>Short-lived rate-limit counters</strong> keyed by IP address or email address, to
          stop sign-in email abuse. They expire within a day and are deleted at the next sign-in
          email request, or straight away when you delete your account.
        </li>
      </ul>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>No ads, no tracking scripts and no analytics cookies.</li>
        <li>We don&apos;t sell or share your data. Microsoft and Google sign-in only give us your basic profile (name and email).</li>
      </ul>

      <h2>Your choices</h2>
      <p>
        You can delete your account at any time from the{" "}
        <Link href="/account" className="underline">
          account page
        </Link>
        . That permanently removes your profile, sessions and games, and takes you off every
        leaderboard. To stop today&apos;s game being replayed with a new account, we keep a one-way
        hash of your email with the date until the next day, then delete it.
      </p>
    </article>
  );
}

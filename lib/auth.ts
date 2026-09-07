import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";
import { users, accounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  trustHost: true,
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      try {
        const existingUsers = await db
          .select()
          .from(users)
          .where(eq(users.email, user.email))
          .limit(1);

        let userId: string;

        if (existingUsers.length === 0) {
          const [newUser] = await db
            .insert(users)
            .values({
              email: user.email,
              name: user.name ?? null,
              image: user.image ?? null,
            })
            .returning();
          userId = newUser.id;
        } else {
          userId = existingUsers[0].id;
          if (
            (user.name && user.name !== existingUsers[0].name) ||
            (user.image && user.image !== existingUsers[0].image)
          ) {
            await db
              .update(users)
              .set({
                name: user.name ?? existingUsers[0].name,
                image: user.image ?? existingUsers[0].image,
              })
              .where(eq(users.id, userId));
          }
        }

        if (account) {
          const existingAccounts = await db
            .select()
            .from(accounts)
            .where(
              and(
                eq(accounts.provider, account.provider),
                eq(accounts.providerAccountId, account.providerAccountId)
              )
            )
            .limit(1);

          if (existingAccounts.length === 0) {
            await db.insert(accounts).values({
              userId,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              accessToken: account.access_token ?? null,
              refreshToken: account.refresh_token ?? null,
            });
          } else {
            await db
              .update(accounts)
              .set({
                accessToken: account.access_token ?? existingAccounts[0].accessToken,
                refreshToken: account.refresh_token ?? existingAccounts[0].refreshToken,
              })
              .where(eq(accounts.id, existingAccounts[0].id));
          }
        }

        return true;
      } catch (error) {
        console.error("Error during signIn callback:", error);
        return false;
      }
    },
    async jwt({ token }) {
      if (token.email) {
        try {
          const [dbUser] = await db
            .select()
            .from(users)
            .where(eq(users.email, token.email))
            .limit(1);
          if (dbUser) {
            token.userId = dbUser.id;
          }
        } catch (error) {
          console.error("Error fetching user in jwt callback:", error);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
});

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateBearerToken } from "./api-auth";
import { headers } from "next/headers";

const nextAuthOptions = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    // ... same as before
    async jwt({ token }) {
      if (token.email) {
        try {
          const [dbUser] = await db.select().from(users).where(eq(users.email, token.email)).limit(1);
          if (dbUser) token.userId = dbUser.id;
        } catch (error) {}
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) session.user.id = token.userId as string;
      return session;
    },
  },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
});

export const { handlers, signIn } = nextAuthOptions;

const originalAuth = nextAuthOptions.auth as any;
export const auth = async (...args: any[]) => {
  const session = await originalAuth(...args);
  if (session?.user?.id) return session;

  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
       const req = new Request("http://localhost", { headers: { authorization: authHeader } });
       const userId = await validateBearerToken(req);
       if (userId) {
         return { user: { id: userId, email: "", name: "" }, expires: "" } as any;
       }
    }
  } catch (e) {
    console.error(e);
  }
  return session;
};

export async function resolveUserId(req: Request): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) return session.user.id;
  return validateBearerToken(req);
}

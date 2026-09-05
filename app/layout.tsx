import MobileFrame from "@/components/MobileFrame";

export const metadata = {
  title: "Lexxio",
  description: "친구들과 즐기는 렉씨오",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>
        <MobileFrame>{children}</MobileFrame>
      </body>
    </html>
  );
}

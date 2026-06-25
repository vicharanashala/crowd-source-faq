"use client";
import BackgroundEffects from "@/components/BackgroundEffects";
import Navbar from "@/components/Navbar";
import FAB from "@/components/FAB";
import { SearchProvider, useSearch } from "@/lib/SearchContext";

function MainInner({ children }: { children: React.ReactNode }) {
  const { searchQ, onSearch } = useSearch();
  return (
    <>
      <BackgroundEffects />
      <Navbar searchQ={searchQ} onSearch={onSearch} />
      <main style={{ position: "relative", zIndex: 2, paddingTop: 0 }}>
        {children}
      </main>
      <FAB />
    </>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <SearchProvider>
      <MainInner>{children}</MainInner>
    </SearchProvider>
  );
}

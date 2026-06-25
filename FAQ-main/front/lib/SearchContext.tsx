"use client";
import { createContext, useContext, useState, useCallback } from "react";

interface SearchCtx { searchQ: string; onSearch: (v: string) => void; }
const SearchContext = createContext<SearchCtx>({ searchQ: "", onSearch: () => {} });

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [searchQ, setSearchQ] = useState("");
  const onSearch = useCallback((v: string) => setSearchQ(v), []);
  return (
    <SearchContext.Provider value={{ searchQ, onSearch }}>
      {children}
    </SearchContext.Provider>
  );
}

export const useSearch = () => useContext(SearchContext);

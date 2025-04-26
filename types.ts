export interface Entry {
  telephoneNumber: string;
  street: string;
  city: string;
  fullName: string;
}

export interface NameStatus {
  [name: string]: {
    currentPage: number;
    totalPages: number;
    status: "pending" | "processing" | "completed";
  };
}

export interface Args {
  minify: boolean;
  nameListFile: string;
  disableCache: boolean;
}

export interface Cache {
  [name: string]: Entry[];
}

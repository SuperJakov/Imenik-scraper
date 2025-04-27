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
  mongodb: boolean; // Changed from mongodbUri to a boolean flag
}

export interface Cache {
  [name: string]: Entry[];
}

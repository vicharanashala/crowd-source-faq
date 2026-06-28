import * as React from 'react';

declare module 'react' {
  export function forwardRef<T, P = any>(render: (props: P, ref: any) => any): any;
}

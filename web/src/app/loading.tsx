import styles from "./loading.module.css";

export default function Loading() {
  return (
    <main className={styles.page}>
      <div className={styles.heading} />
      <div className={styles.filters} />
      <div className={styles.table} />
    </main>
  );
}

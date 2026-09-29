// App.tsx와 Sidebar.tsx가 서로를 import하는 순환참조를 피하려고 뷰 키 타입만 따로 뺐다.
export type ViewKey = "overview" | "progress";

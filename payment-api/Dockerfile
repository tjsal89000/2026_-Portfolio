# 멀티스테이지 빌드 - 빌드 도구(Maven)와 소스는 최종 이미지에 안 남기고 jar만 남긴다
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
# 의존성 레이어를 소스 변경과 분리해서 캐시 - pom.xml만 안 바뀌면 mvn dependency 재다운로드를 건너뜀
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /build/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]

package com.aiops.dbwriter.kafka;

import org.junit.jupiter.api.Test;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;

import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ConsumerPauseServiceTest {

    @Test
    void pause_stopsListenerAndSchedulesResume() {
        var registry = mock(KafkaListenerEndpointRegistry.class);
        var container = mock(MessageListenerContainer.class);
        var scheduler = mock(ScheduledExecutorService.class);
        when(registry.getListenerContainer(ConsumerPauseService.LISTENER_ID)).thenReturn(container);
        var service = new ConsumerPauseService(registry, scheduler);

        var result = service.pause(30);

        assertTrue(result.started());
        assertEquals(30, result.seconds());
        verify(container).pause();
        verify(scheduler).schedule(any(Runnable.class), eq(30L), eq(TimeUnit.SECONDS));
    }

    @Test
    void pause_rejectsSecondRequestWhileAlreadyPaused() {
        var registry = mock(KafkaListenerEndpointRegistry.class);
        var container = mock(MessageListenerContainer.class);
        when(registry.getListenerContainer(ConsumerPauseService.LISTENER_ID)).thenReturn(container);
        when(container.isContainerPaused()).thenReturn(true);
        var service = new ConsumerPauseService(registry, mock(ScheduledExecutorService.class));

        var result = service.pause(30);

        assertFalse(result.started());
        verify(container, never()).pause();
    }

    @Test
    void pause_clampsDurationToMaximum() {
        var registry = mock(KafkaListenerEndpointRegistry.class);
        var container = mock(MessageListenerContainer.class);
        var scheduler = mock(ScheduledExecutorService.class);
        when(registry.getListenerContainer(ConsumerPauseService.LISTENER_ID)).thenReturn(container);
        var service = new ConsumerPauseService(registry, scheduler);

        var result = service.pause(9999);

        assertEquals(ConsumerPauseService.MAX_SECONDS, result.seconds());
        verify(scheduler).schedule(any(Runnable.class), eq((long) ConsumerPauseService.MAX_SECONDS), eq(TimeUnit.SECONDS));
    }
}
